import aiosqlite
import os
from datetime import datetime, date
from typing import List, Optional
from .models import Product, ProductCreate, StockUpdate, ProductUpdate, Batch, BatchUpdate, BatchStockUpdate, MacroGoals, MacroGoalsUpdate

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
                    location TEXT DEFAULT NULL,
                    image_url TEXT DEFAULT NULL,
                    weight_g REAL DEFAULT NULL,
                    kcal_100g REAL DEFAULT NULL,
                    proteins_100g REAL DEFAULT NULL,
                    carbs_100g REAL DEFAULT NULL,
                    fat_100g REAL DEFAULT NULL,
                    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            # Migration: add expiry_date column if it doesn't exist
            async with db.execute("PRAGMA table_info(products)") as cursor:
                columns = [row[1] for row in await cursor.fetchall()]
            if 'expiry_date' not in columns:
                await db.execute("ALTER TABLE products ADD COLUMN expiry_date TEXT DEFAULT NULL")
            if 'location' not in columns:
                await db.execute("ALTER TABLE products ADD COLUMN location TEXT DEFAULT NULL")
            if 'image_url' not in columns:
                await db.execute("ALTER TABLE products ADD COLUMN image_url TEXT DEFAULT NULL")
            if 'weight_g' not in columns:
                await db.execute("ALTER TABLE products ADD COLUMN weight_g REAL DEFAULT NULL")
            if 'kcal_100g' not in columns:
                await db.execute("ALTER TABLE products ADD COLUMN kcal_100g REAL DEFAULT NULL")
            if 'proteins_100g' not in columns:
                await db.execute("ALTER TABLE products ADD COLUMN proteins_100g REAL DEFAULT NULL")
            if 'carbs_100g' not in columns:
                await db.execute("ALTER TABLE products ADD COLUMN carbs_100g REAL DEFAULT NULL")
            if 'fat_100g' not in columns:
                await db.execute("ALTER TABLE products ADD COLUMN fat_100g REAL DEFAULT NULL")

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

            # Create macro_goals table
            await db.execute("""
                CREATE TABLE IF NOT EXISTS macro_goals (
                    id INTEGER PRIMARY KEY DEFAULT 1,
                    kcal REAL DEFAULT 2000,
                    proteins REAL DEFAULT 150,
                    carbs REAL DEFAULT 200,
                    fat REAL DEFAULT 70
                )
            """)
            
            # Ensure at least one row exists
            async with db.execute("SELECT COUNT(*) FROM macro_goals") as cursor:
                count = (await cursor.fetchone())[0]
            if count == 0:
                await db.execute("INSERT INTO macro_goals (id, kcal, proteins, carbs, fat) VALUES (1, 2000, 150, 200, 70)")

            # Create movements table for tracking stock changes
            await db.execute("""
                CREATE TABLE IF NOT EXISTS movements (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    barcode TEXT NOT NULL,
                    quantity_change INTEGER NOT NULL,
                    reason TEXT DEFAULT 'consumed',
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
                """INSERT INTO products (barcode, name, category, stock, min_stock, location, image_url, weight_g, kcal_100g, proteins_100g, carbs_100g, fat_100g, last_updated)
                   VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (product.barcode, product.name, product.category, product.min_stock, product.location, product.image_url, 
                 product.weight_g, product.kcal_100g, product.proteins_100g, product.carbs_100g, product.fat_100g, datetime.now())
            )
            await db.commit()
        return await self.get_product(product.barcode)

    async def _log_movement(self, db, barcode: str, quantity_change: int, reason: str = "consumed"):
        """Log a stock movement for traceability"""
        await db.execute(
            "INSERT INTO movements (barcode, quantity_change, reason) VALUES (?, ?, ?)",
            (barcode, quantity_change, reason)
        )

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

            # Log movement with reason (default to "consumed" if not specified)
            reason = update.reason or "consumed"
            await self._log_movement(db, barcode, update.quantity, reason)
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
        if update.location is not None:
            updates['location'] = update.location
        if hasattr(update, 'image_url') and update.image_url is not None:
            updates['image_url'] = update.image_url
        if hasattr(update, 'weight_g') and update.weight_g is not None:
            updates['weight_g'] = update.weight_g
        if hasattr(update, 'kcal_100g') and update.kcal_100g is not None:
            updates['kcal_100g'] = update.kcal_100g
        if hasattr(update, 'proteins_100g') and update.proteins_100g is not None:
            updates['proteins_100g'] = update.proteins_100g
        if hasattr(update, 'carbs_100g') and update.carbs_100g is not None:
            updates['carbs_100g'] = update.carbs_100g
        if hasattr(update, 'fat_100g') and update.fat_100g is not None:
            updates['fat_100g'] = update.fat_100g

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

            await self._log_movement(db, barcode, update.quantity, "manual_update")
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

    async def get_products_by_location(self, location: str) -> List[Product]:
        """Get all products at a specific location"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM products WHERE location = ? ORDER BY name", (location,)
            ) as cursor:
                rows = await cursor.fetchall()
            products = []
            for row in rows:
                product = await self._build_product(db, dict(row))
                products.append(product)
            return products

    async def get_all_locations(self) -> List[str]:
        """Get all unique product locations"""
        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute(
                "SELECT DISTINCT location FROM products WHERE location IS NOT NULL ORDER BY location"
            ) as cursor:
                rows = await cursor.fetchall()
                return [row[0] for row in rows]

    async def get_stats(self) -> dict:
        """Get inventory statistics"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """SELECT 
                    COUNT(*) as total_products,
                    COALESCE(SUM(stock), 0) as total_units,
                    COUNT(CASE WHEN stock < min_stock THEN 1 END) as low_stock_count
                   FROM products"""
            ) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else {"total_products": 0, "total_units": 0, "low_stock_count": 0}

    async def get_consumption_stats(self, days: int = 30) -> List[dict]:
        """Get consumption (negative movements) grouped by day"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            # Filter for negative changes (consumptions) and last X days
            async with db.execute("""
                SELECT 
                    date(timestamp) as day,
                    ABS(SUM(quantity_change)) as total
                FROM movements
                WHERE quantity_change < 0 
                AND timestamp >= date('now', ?)
                GROUP BY day
                ORDER BY day ASC
            """, (f'-{days} days',)) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def get_daily_macros(self) -> dict:
        """Get summarized macros consumed today"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            # Multiply consumed quantities by macros. 
            # Note: weight_g and macros are per 100g, so if weight_g is 500, a whole unit is 5 * macros.
            # We assume quantity_change=1 unit = weight_g / 100 * macros.
            # If weight_g is not available, we can't accurately calculate macros, so we assume 0 or handle it
            async with db.execute("""
                SELECT 
                    SUM(ABS(m.quantity_change) * (IFNULL(p.weight_g, 100) / 100.0) * IFNULL(p.kcal_100g, 0)) as total_kcal,
                    SUM(ABS(m.quantity_change) * (IFNULL(p.weight_g, 100) / 100.0) * IFNULL(p.proteins_100g, 0)) as total_proteins,
                    SUM(ABS(m.quantity_change) * (IFNULL(p.weight_g, 100) / 100.0) * IFNULL(p.carbs_100g, 0)) as total_carbs,
                    SUM(ABS(m.quantity_change) * (IFNULL(p.weight_g, 100) / 100.0) * IFNULL(p.fat_100g, 0)) as total_fat
                FROM movements m
                JOIN products p ON m.barcode = p.barcode
                WHERE m.quantity_change < 0 
                AND date(m.timestamp) = date('now')
            """) as cursor:
                row = await cursor.fetchone()
                if row:
                    return dict(row)
                return {"total_kcal": 0, "total_proteins": 0, "total_carbs": 0, "total_fat": 0}

    async def get_export_data(self) -> List[dict]:
        """Get all inventory data in a flat format for export"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            # Join products and batches to get a flat list. 
            # We use LEFT JOIN to include products even if they have no batches (though in our sync system they shouldn't)
            async with db.execute("""
                SELECT p.barcode, p.name, p.category, p.location, p.min_stock, p.image_url, p.weight_g, p.kcal_100g, p.proteins_100g, p.carbs_100g, p.fat_100g, b.quantity, b.expiry_date
                FROM products p
                LEFT JOIN batches b ON p.barcode = b.barcode
                ORDER BY p.name
            """) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def import_data(self, data: List[dict], clear_existing: bool = False):
        """Import data from a list of dicts. If clear_existing is True, clears DB first."""
        async with aiosqlite.connect(self.db_path) as db:
            if clear_existing:
                await db.execute("DELETE FROM batches")
                await db.execute("DELETE FROM products")
                await db.execute("DELETE FROM movements")
            
            for item in data:
                barcode = item.get('barcode')
                if not barcode: continue
                
                # Insert or update product
                await db.execute("""
                    INSERT INTO products (barcode, name, category, location, min_stock, image_url, weight_g, kcal_100g, proteins_100g, carbs_100g, fat_100g, stock, last_updated)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
                    ON CONFLICT(barcode) DO UPDATE SET
                        name=excluded.name,
                        category=excluded.category,
                        location=excluded.location,
                        min_stock=excluded.min_stock,
                        image_url=COALESCE(excluded.image_url, products.image_url),
                        weight_g=COALESCE(excluded.weight_g, products.weight_g),
                        kcal_100g=COALESCE(excluded.kcal_100g, products.kcal_100g),
                        proteins_100g=COALESCE(excluded.proteins_100g, products.proteins_100g),
                        carbs_100g=COALESCE(excluded.carbs_100g, products.carbs_100g),
                        fat_100g=COALESCE(excluded.fat_100g, products.fat_100g),
                        last_updated=excluded.last_updated
                """, (
                    barcode,
                    item.get('name', 'Huerfano'),
                    item.get('category', 'Otros'),
                    item.get('location'),
                    item.get('min_stock', 2),
                    item.get('image_url'),
                    item.get('weight_g'),
                    item.get('kcal_100g'),
                    item.get('proteins_100g'),
                    item.get('carbs_100g'),
                    item.get('fat_100g'),
                    datetime.now()
                ))

                # Insert batch if quantity > 0
                qty = item.get('quantity')
                if qty and int(qty) > 0:
                    await db.execute("""
                        INSERT INTO batches (barcode, quantity, expiry_date, added_date)
                        VALUES (?, ?, ?, ?)
                    """, (
                        barcode,
                        int(qty),
                        item.get('expiry_date'),
                        date.today().isoformat()
                    ))
            
            # Final sync for all products to ensure totals are correct
            async with db.execute("SELECT barcode FROM products") as cursor:
                product_barcodes = [row[0] for row in await cursor.fetchall()]
            
            for barcode in product_barcodes:
                await self._sync_product_stock(db, barcode)
                
            await db.commit()

    async def get_macro_goals(self) -> MacroGoals:
        """Get the current macro goals"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM macro_goals WHERE id = 1") as cursor:
                row = await cursor.fetchone()
                if row:
                    return MacroGoals(**dict(row))
                return MacroGoals()
                
    async def update_macro_goals(self, update: MacroGoalsUpdate) -> MacroGoals:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            updates = {}
            if update.kcal is not None: updates['kcal'] = update.kcal
            if update.proteins is not None: updates['proteins'] = update.proteins
            if update.carbs is not None: updates['carbs'] = update.carbs
            if update.fat is not None: updates['fat'] = update.fat
            
            if updates:
                set_clause = ', '.join(f"{k} = ?" for k in updates.keys())
                values = list(updates.values())
                await db.execute(f"UPDATE macro_goals SET {set_clause} WHERE id = 1", values)
                await db.commit()
            
            return await self.get_macro_goals()

db = Database()
