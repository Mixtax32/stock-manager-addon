from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
import logging
from typing import List

from .database import db
from .models import Product, ProductCreate, StockUpdate, ProductUpdate

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
    description="API para gestión de inventario doméstico",
    version="0.1.0"
)

# CORS configuration for Home Assistant ingress
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Startup event
@app.on_event("startup")
async def startup():
    logger.info("Initializing Stock Manager...")
    await db.init_db()
    logger.info("Database initialized")
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

@app.get("/api/stats")
async def get_stats():
    """Get inventory statistics"""
    return await db.get_stats()

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