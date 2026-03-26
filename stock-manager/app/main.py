from fastapi import FastAPI, HTTPException, Request, File, UploadFile
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
import logging
from typing import List

from .database import db
from .models import Product, ProductCreate, StockUpdate, ProductUpdate, Batch, BatchUpdate, BatchStockUpdate, MacroGoals, MacroGoalsUpdate
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

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Startup ---
    logger.info("Initializing Stock Manager...")
    await db.init_db()
    
    # Start Telegram Bot in background and store task
    bot_task = asyncio.create_task(telegram_bot.run())
    logger.info("Stock Manager started successfully")
    
    yield
    
    # --- Shutdown ---
    logger.info("Shutting down Telegram Bot...")
    bot_task.cancel()
    try:
        await bot_task
    except asyncio.CancelledError:
        logger.info("Telegram Bot task cancelled successfully")

# Create FastAPI app
app = FastAPI(
    title="Stock Manager API",
    description="API para gestión de inventario doméstico",
    lifespan=lifespan
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

@app.get("/api/products/low-stock/list", response_model=List[Product])
async def get_low_stock():
    """Get products with low stock"""
    return await db.get_low_stock_products()

@app.get("/api/products/macro-fill-preview")
async def macro_fill_preview():
    """Find products with missing macros and try to fetch them from APIs"""
    products = await db.get_all_products()
    # Filter products with missing macros (kcal is usually the best indicator)
    to_fill = [p for p in products if (p.kcal_100g is None or p.kcal_100g == 0) and len(p.barcode) >= 8]
    
    results = []
    # Limit to 20 for safety/performance in one go, user can run it multiple times
    for p in to_fill[:20]:
        data = await get_product_from_barcode(p.barcode)
        if data and data.get("found"):
            # Check if it actually has nutritional info
            if data.get("kcal_100g") is not None:
                results.append({
                    "barcode": p.barcode,
                    "name": p.name,
                    "suggested": {
                        "weight_g": data.get("weight_g"),
                        "kcal_100g": data.get("kcal_100g"),
                        "proteins_100g": data.get("proteins_100g"),
                        "carbs_100g": data.get("carbs_100g"),
                        "fat_100g": data.get("fat_100g"),
                        "image_url": data.get("image_url")
                    }
                })
    return results

@app.post("/api/products/macro-fill-confirm")
async def macro_fill_confirm(updates: List[dict]):
    """Update products with the nutritional data confirmed by the user"""
    updated_count = 0
    for up in updates:
        barcode = up.get("barcode")
        if barcode:
            try:
                macro_data = ProductUpdate(
                    weight_g=up.get("weight_g"),
                    kcal_100g=up.get("kcal_100g"),
                    proteins_100g=up.get("proteins_100g"),
                    carbs_100g=up.get("carbs_100g"),
                    fat_100g=up.get("fat_100g"),
                    image_url=up.get("image_url")
                )
                await db.update_product(barcode, macro_data)
                updated_count += 1
            except Exception as e:
                logger.error(f"Error updated macros for {barcode}: {e}")
                
    return {"message": f"Se han actualizado {updated_count} productos correctamente"}

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

@app.get("/api/stats/daily-macros")
async def get_daily_macros():
    """Get macros consumed today"""
    return await db.get_daily_macros()

@app.get("/api/stats/macro-goals", response_model=MacroGoals)
async def get_macro_goals():
    """Get daily macro goals"""
    return await db.get_macro_goals()

@app.patch("/api/stats/macro-goals", response_model=MacroGoals)
async def update_macro_goals(update: MacroGoalsUpdate):
    """Update daily macro goals"""
    return await db.update_macro_goals(update)

@app.get("/api/stats/today-movements")
async def get_today_movements():
    """Get list of products consumed today"""
    return await db.get_today_movements()

@app.delete("/api/movements/{movement_id}")
async def delete_movement(movement_id: int, restore_stock: bool = True):
    """Delete movement and optionally restore stock"""
    success = await db.delete_movement(movement_id, restore_stock)
    if not success:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")
    return {"message": "Movimiento eliminado"}

@app.get("/api/export")
async def export_data():
    """Export all inventory data as CSV"""
    import csv
    import io
    from fastapi.responses import StreamingResponse
    
    data = await db.get_export_data()
    
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["barcode", "name", "category", "location", "min_stock", "image_url", "weight_g", "kcal_100g", "proteins_100g", "carbs_100g", "fat_100g", "quantity", "expiry_date"])
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

    return {"message": f"Se han actualizado {updated_count} productos correctamente"}

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