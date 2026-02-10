import aiosqlite
import os
from datetime import datetime, date
from typing import List, Optional
from .models import Product, ProductCreate, StockUpdate, ProductUpdate, Batch, BatchUpdate, BatchStockUpdate

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
                    expiry_date TEXT DEFAULT NULL,
                    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            # Migration: add expiry_date column if it doesn't exist
            async with db.execute("PRAGMA table_info(products)") as cursor:
                columns = [row[1] for row in await cursor.fetchall()]
            if 'expiry_date' not in columns:
                await db.execute("ALTER TABLE products ADD COLUMN expiry_date TEXT DEFAULT NULL")

            # Create batches table
            await db.execute("""
                CREATE TABLE IF NOT EXISTS batches (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    barcode TEXT NOT NULL,
                    quantity INTEGER NOT NULL,
                    expiry_date TEXT DEFAULT NULL,
                    added_date TEXT DEFAULT NULL,
                    FOREIGN KEY (barcode) REFERENCES products(barcode) ON DELETE CASCADE
                )
            """)

            # Migration: create batch entries for existing products that have stock but no batches
            async with db.execute("""
                SELECT barcode, stock, expiry_date FROM products
                WHERE stock > 0 AND barcode NOT IN (SELECT DISTINCT barcode FROM batches)
            """) as cursor:
                rows = await cursor.fetchall()
            for row in rows:
                await db.execute(
                    "INSERT INTO batches (barcode, quantity, expiry_date, added_date) VALUES (?, ?, ?, ?)",
                    (row[0], row[1], row[2], date.today().isoformat())
                )

            await db.commit()

    async def _get_batches(self, db, barcode: str) -> List[Batch]:
        """Get batches for a product, ordered by expiry (earliest first, NULLs last)"""
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT * FROM batches WHERE barcode = ? AND quantity > 0
               ORDER BY CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END, expiry_date ASC""",
            (barcode,)
        ) as cursor:
            rows = await cursor.fetchall()
            return [Batch(**dict(row)) for row in rows]

    async def _sync_product_stock(self, db, barcode: str):
        """Sync product stock and expiry_date from batches"""
        async with db.execute(
            "SELECT COALESCE(SUM(quantity), 0) FROM batches WHERE barcode = ? AND quantity > 0",
            (barcode,)
        ) as cursor:
            row = await cursor.fetchone()
            total_stock = row[0]

        # Earliest expiry from active batches
        async with db.execute(
            """SELECT expiry_date FROM batches
               WHERE barcode = ? AND quantity > 0 AND expiry_date IS NOT NULL
               ORDER BY expiry_date ASC LIMIT 1""",
            (barcode,)
        ) as cursor:
            row = await cursor.fetchone()
            earliest_expiry = row[0] if row else None

        await db.execute(
            "UPDATE products SET stock = ?, expiry_date = ?, last_updated = ? WHERE barcode = ?",
            (total_stock, earliest_expiry, datetime.now(), barcode)
        )

    async def _build_product(self, db, row_dict: dict) -> Product:
        """Build a Product with its batches"""
        batches = await self._get_batches(db, row_dict['barcode'])
        return Product(**row_dict, batches=batches)

    async def get_all_products(self) -> List[Product]:
        """Get all products with batches"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM products ORDER BY name") as cursor:
                rows = await cursor.fetchall()
            products = []
            for row in rows:
                product = await self._build_product(db, dict(row))
                products.append(product)
            return products

    async def get_product(self, barcode: str) -> Optional[Product]:
        """Get product by barcode with batches"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM products WHERE barcode = ?", (barcode,)
            ) as cursor:
                row = await cursor.fetchone()
                if not row:
                    return None
                return await self._build_product(db, dict(row))

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
        """Update product stock via batches"""
        async with aiosqlite.connect(self.db_path) as db:
            if update.quantity > 0:
                # Adding stock: create a new batch
                await db.execute(
                    "INSERT INTO batches (barcode, quantity, expiry_date, added_date) VALUES (?, ?, ?, ?)",
                    (barcode, update.quantity, update.expiry_date, date.today().isoformat())
                )
            else:
                # Removing stock: consume from oldest expiry first (FIFO)
                remaining = abs(update.quantity)
                batches = await self._get_batches(db, barcode)
                for batch in batches:
                    if remaining <= 0:
                        break
                    consume = min(batch.quantity, remaining)
                    new_qty = batch.quantity - consume
                    if new_qty == 0:
                        await db.execute("DELETE FROM batches WHERE id = ?", (batch.id,))
                    else:
                        await db.execute("UPDATE batches SET quantity = ? WHERE id = ?", (new_qty, batch.id))
                    remaining -= consume

            await self._sync_product_stock(db, barcode)
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

    async def update_batch(self, batch_id: int, update: BatchUpdate) -> Optional[Batch]:
        """Update a batch's expiry date"""
        async with aiosqlite.connect(self.db_path) as db:
            # Get batch to find its barcode
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM batches WHERE id = ?", (batch_id,)) as cursor:
                row = await cursor.fetchone()
                if not row:
                    return None
                barcode = row['barcode']

            await db.execute(
                "UPDATE batches SET expiry_date = ? WHERE id = ?",
                (update.expiry_date, batch_id)
            )
            await self._sync_product_stock(db, barcode)
            await db.commit()

            # Return updated batch
            async with db.execute("SELECT * FROM batches WHERE id = ?", (batch_id,)) as cursor:
                row = await cursor.fetchone()
                return Batch(**dict(row)) if row else None

    async def update_batch_stock(self, batch_id: int, update: BatchStockUpdate) -> Optional[dict]:
        """Add or remove stock from a specific batch"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM batches WHERE id = ?", (batch_id,)) as cursor:
                row = await cursor.fetchone()
                if not row:
                    return None
                barcode = row['barcode']
                current_qty = row['quantity']

            new_qty = current_qty + update.quantity
            if new_qty < 0:
                return None  # Can't go negative

            if new_qty == 0:
                await db.execute("DELETE FROM batches WHERE id = ?", (batch_id,))
            else:
                await db.execute("UPDATE batches SET quantity = ? WHERE id = ?", (new_qty, batch_id))

            await self._sync_product_stock(db, barcode)
            await db.commit()

        product = await self.get_product(barcode)
        return product

    async def delete_product(self, barcode: str) -> bool:
        """Delete product and its batches"""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("DELETE FROM batches WHERE barcode = ?", (barcode,))
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
                "SELECT * FROM products WHERE stock < min_stock ORDER BY name"
            ) as cursor:
                rows = await cursor.fetchall()
            products = []
            for row in rows:
                product = await self._build_product(db, dict(row))
                products.append(product)
            return products

    async def get_stats(self) -> dict:
        """Get inventory statistics"""
        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute(
                """SELECT
                    COUNT(*) as total_products,
                    SUM(stock) as total_units,
                    COUNT(CASE WHEN stock < min_stock THEN 1 END) as low_stock_count
                   FROM products"""
            ) as cursor:
                row = await cursor.fetchone()
                return {
                    'total_products': row[0] or 0,
                    'total_units': row[1] or 0,
                    'low_stock_count': row[2] or 0
                }

db = Database()
