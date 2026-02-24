from fastapi import FastAPI, HTTPException, Request, File, UploadFile
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
import logging
from typing import List

from .database import db
from .models import Product, ProductCreate, StockUpdate, ProductUpdate, Batch, BatchUpdate, BatchStockUpdate
from .barcode_service import get_product_from_barcode
from .telegram_service import telegram_bot
import asyncio

# Configure logging
log_level = os.getenv('LOG_LEVEL', 'INFO').upper()
logging.basicConfig(
    level=getattr(logging, log_level),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Stock Manager API",
    description="API para gestión de inventario doméstico"
)

# CORS configuration for Home Assistant ingress
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global exception handler - always return JSON so frontend can parse errors
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": f"Error interno: {str(exc)}"}
    )

# Startup event
@app.on_event("startup")
async def startup():
    logger.info("Initializing Stock Manager...")
    await db.init_db()
    logger.info("Database initialized")
    
    # Start Telegram Bot in background
    asyncio.create_task(telegram_bot.run())
    
    logger.info("Stock Manager started successfully")

# Root endpoint - serve frontend (no-cache to avoid stale JS after updates)
@app.get("/")
async def read_root():
    return FileResponse(
        "/app/app/static/index.html",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
    )

# API endpoints
@app.get("/api/products", response_model=List[Product])
async def get_products():
    """Get all products"""
    return await db.get_all_products()

@app.get("/api/products/{barcode}", response_model=Product)
async def get_product(barcode: str):
    """Get product by barcode"""
    product = await db.get_product(barcode)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product

@app.get("/api/barcode/{barcode}")
async def lookup_barcode(barcode: str):
    """Lookup product from Open Food Facts API by barcode"""
    return await get_product_from_barcode(barcode)

@app.post("/api/products", response_model=Product, status_code=201)
async def create_product(product: ProductCreate):
    """Create new product"""
    existing = await db.get_product(product.barcode)
    if existing:
        raise HTTPException(status_code=400, detail="Product already exists")
    return await db.create_product(product)

@app.patch("/api/products/{barcode}", response_model=Product)
async def update_product(barcode: str, update: ProductUpdate):
    """Update product details"""
    product = await db.update_product(barcode, update)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product

@app.post("/api/products/{barcode}/stock", response_model=Product)
async def update_stock(barcode: str, update: StockUpdate):
    """Update product stock (add or remove)"""
    product = await db.get_product(barcode)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Check if removing more than available
    if update.quantity < 0 and product.stock + update.quantity < 0:
        raise HTTPException(status_code=400, detail="Insufficient stock")
    
    return await db.update_stock(barcode, update)

@app.patch("/api/batches/{batch_id}", response_model=Batch)
async def update_batch(batch_id: int, update: BatchUpdate):
    """Update batch expiry date"""
    batch = await db.update_batch(batch_id, update)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    return batch

@app.post("/api/batches/{batch_id}/stock", response_model=Product)
async def update_batch_stock(batch_id: int, update: BatchStockUpdate):
    """Add or remove stock from a specific batch"""
    result = await db.update_batch_stock(batch_id, update)
    if not result:
        raise HTTPException(status_code=400, detail="Batch not found or insufficient stock")
    return result

@app.delete("/api/products/{barcode}", status_code=204)
async def delete_product(barcode: str):
    """Delete product"""
    success = await db.delete_product(barcode)
    if not success:
        raise HTTPException(status_code=404, detail="Product not found")
    return None

@app.get("/api/products/low-stock/list", response_model=List[Product])
async def get_low_stock():
    """Get products with low stock"""
    return await db.get_low_stock_products()

@app.get("/api/locations", response_model=List[str])
async def get_locations():
    """Get all product locations"""
    return await db.get_all_locations()

@app.get("/api/products/location/{location}", response_model=List[Product])
async def get_products_by_location(location: str):
    """Get all products at a specific location"""
    return await db.get_products_by_location(location)

@app.get("/api/stats")
async def get_stats():
    """Get inventory statistics"""
    return await db.get_stats()

@app.get("/api/stats/consumption")
async def get_consumption_stats(days: int = 30):
    return await db.get_consumption_stats(days)

@app.get("/api/export")
async def export_data():
    """Export all inventory data as CSV"""
    import csv
    import io
    from fastapi.responses import StreamingResponse
    
    data = await db.get_export_data()
    
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["barcode", "name", "category", "location", "min_stock", "image_url", "quantity", "expiry_date"])
    writer.writeheader()
    writer.writerows(data)
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=inventario_stock.csv"}
    )

@app.post("/api/import")
async def import_data(file: UploadFile = File(...), clear: bool = False):
    """Import inventory data from CSV file"""
    import csv
    import io
    
    try:
        content = await file.read()
        # Handle possible BOM and different encodings
        try:
            text = content.decode('utf-8-sig')
        except UnicodeDecodeError:
            text = content.decode('latin-1')
            
        f = io.StringIO(text)
        
        # Detect delimiter and clean up first line
        lines = text.splitlines()
        if not lines:
            raise HTTPException(status_code=400, detail="El archivo está vacío")
            
        first_line = lines[0]
        delimiter = ';' if ';' in first_line else ','
        
        # Reset StringIO after reading first line for detection
        f.seek(0)
        reader = csv.DictReader(f, delimiter=delimiter)
        data = [row for row in reader]
        
        if not data:
            raise HTTPException(status_code=400, detail="No se encontraron datos en el archivo")
            
        await db.import_data(data, clear_existing=clear)
        return {"message": "Importación completada", "count": len(data)}
        
    except Exception as e:
        logger.error(f"Error en importación: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error procesando el archivo: {str(e)}")

# Health check
@app.get("/api/health")
async def health_check():
    return {"status": "healthy"}

# Serve static files
app.mount("/static", StaticFiles(directory="/app/app/static"), name="static")

# Run server
if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8099,
        log_level=log_level.lower()
    )