import aiosqlite
import os
from datetime import datetime
from typing import List, Optional
from .models import Product, ProductCreate, StockUpdate, ProductUpdate

DATABASE_PATH = os.getenv('DATABASE_PATH', '/data/stock_manager/stock.db')

class Database:
    def __init__(self):
        self.db_path = DATABASE_PATH
        
    async def init_db(self):
        """Initialize database schema"""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS products (
                    barcode TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    category TEXT NOT NULL,
                    stock INTEGER NOT NULL DEFAULT 0,
                    min_stock INTEGER NOT NULL DEFAULT 2,
                    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            await db.commit()
    
    async def get_all_products(self) -> List[Product]:
        """Get all products"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM products ORDER BY name") as cursor:
                rows = await cursor.fetchall()
                return [Product(**dict(row)) for row in rows]
    
    async def get_product(self, barcode: str) -> Optional[Product]:
        """Get product by barcode"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM products WHERE barcode = ?", (barcode,)
            ) as cursor:
                row = await cursor.fetchone()
                return Product(**dict(row)) if row else None
    
    async def create_product(self, product: ProductCreate) -> Product:
        """Create new product"""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """INSERT INTO products (barcode, name, category, stock, min_stock, last_updated)
                   VALUES (?, ?, ?, 0, ?, ?)""",
                (product.barcode, product.name, product.category, product.min_stock, datetime.now())
            )
            await db.commit()
        return await self.get_product(product.barcode)
    
    async def update_stock(self, barcode: str, update: StockUpdate) -> Optional[Product]:
        """Update product stock"""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """UPDATE products 
                   SET stock = stock + ?, last_updated = ?
                   WHERE barcode = ?""",
                (update.quantity, datetime.now(), barcode)
            )
            await db.commit()
        return await self.get_product(barcode)
    
    async def update_product(self, barcode: str, update: ProductUpdate) -> Optional[Product]:
        """Update product details"""
        product = await self.get_product(barcode)
        if not product:
            return None
        
        updates = {}
        if update.name is not None:
            updates['name'] = update.name
        if update.category is not None:
            updates['category'] = update.category
        if update.min_stock is not None:
            updates['min_stock'] = update.min_stock
        
        if updates:
            updates['last_updated'] = datetime.now()
            set_clause = ', '.join(f"{k} = ?" for k in updates.keys())
            values = list(updates.values()) + [barcode]
            
            async with aiosqlite.connect(self.db_path) as db:
                await db.execute(
                    f"UPDATE products SET {set_clause} WHERE barcode = ?",
                    values
                )
                await db.commit()
        
        return await self.get_product(barcode)
    
    async def delete_product(self, barcode: str) -> bool:
        """Delete product"""
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(
                "DELETE FROM products WHERE barcode = ?", (barcode,)
            )
            await db.commit()
            return cursor.rowcount > 0
    
    async def get_low_stock_products(self) -> List[Product]:
        """Get products with low stock"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM products WHERE stock <= min_stock ORDER BY name"
            ) as cursor:
                rows = await cursor.fetchall()
                return [Product(**dict(row)) for row in rows]
    
    async def get_stats(self) -> dict:
        """Get inventory statistics"""
        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute(
                """SELECT 
                    COUNT(*) as total_products,
                    SUM(stock) as total_units,
                    COUNT(CASE WHEN stock <= min_stock THEN 1 END) as low_stock_count
                   FROM products"""
            ) as cursor:
                row = await cursor.fetchone()
                return {
                    'total_products': row[0] or 0,
                    'total_units': row[1] or 0,
                    'low_stock_count': row[2] or 0
                }

db = Database()