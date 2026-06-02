import aiosqlite
import os
import json
from datetime import datetime, date
from typing import List, Optional
from .models import (
    Product, ProductCreate, StockUpdate, ProductUpdate, Batch, BatchUpdate, BatchStockUpdate,
    MacroGoals, MacroGoalsUpdate, Ingredient, Recipe, RecipeCreate, DietPlan, DietPlanCreate,
    BodyWeight, BodyWeightCreate,
    Scale, ScaleCreate, ScaleUpdate, ScaleWeight, ScaleEvent,
    PendingRefill, PendingRefillCreate, PendingRefillResolve,
    PriceRecord, PriceHistoryEntry,
)

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
                    stock REAL NOT NULL DEFAULT 0,
                    min_stock REAL NOT NULL DEFAULT 2,
                    unit_type TEXT NOT NULL DEFAULT 'uds',
                    expiry_date TEXT DEFAULT NULL,
                    location TEXT DEFAULT NULL,
                    image_url TEXT DEFAULT NULL,
                    weight_g REAL DEFAULT NULL,
                    kcal_100g REAL DEFAULT NULL,
                    proteins_100g REAL DEFAULT NULL,
                    carbs_100g REAL DEFAULT NULL,
                    fat_100g REAL DEFAULT NULL,
                    serving_size REAL DEFAULT NULL,
                    package_quantity TEXT DEFAULT NULL,
                    tracking_mode TEXT NOT NULL DEFAULT 'manual',
                    scale_min_delta_g REAL NOT NULL DEFAULT 10.0,
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
            if 'unit_type' not in columns:
                await db.execute("ALTER TABLE products ADD COLUMN unit_type TEXT NOT NULL DEFAULT 'uds'")
            if 'serving_size' not in columns:
                await db.execute("ALTER TABLE products ADD COLUMN serving_size REAL DEFAULT NULL")
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
            if 'package_quantity' not in columns:
                await db.execute("ALTER TABLE products ADD COLUMN package_quantity TEXT DEFAULT NULL")
            if 'tracking_mode' not in columns:
                await db.execute("ALTER TABLE products ADD COLUMN tracking_mode TEXT NOT NULL DEFAULT 'manual'")
            if 'scale_min_delta_g' not in columns:
                await db.execute("ALTER TABLE products ADD COLUMN scale_min_delta_g REAL NOT NULL DEFAULT 10.0")
            if 'last_price' not in columns:
                await db.execute("ALTER TABLE products ADD COLUMN last_price REAL DEFAULT NULL")
            if 'last_price_date' not in columns:
                await db.execute("ALTER TABLE products ADD COLUMN last_price_date TEXT DEFAULT NULL")

            # Create batches table
            await db.execute("""
                CREATE TABLE IF NOT EXISTS batches (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    barcode TEXT NOT NULL,
                    quantity REAL NOT NULL,
                    expiry_date TEXT DEFAULT NULL,
                    added_date TEXT DEFAULT NULL,
                    location TEXT DEFAULT NULL,
                    FOREIGN KEY (barcode) REFERENCES products(barcode) ON DELETE CASCADE
                )
            """)

            # Migration: add location column to existing batches table
            async with db.execute("PRAGMA table_info(batches)") as cursor:
                batch_cols = [row[1] for row in await cursor.fetchall()]
            if 'location' not in batch_cols:
                await db.execute("ALTER TABLE batches ADD COLUMN location TEXT DEFAULT NULL")
            if 'last_price' not in batch_cols:
                await db.execute("ALTER TABLE batches ADD COLUMN last_price REAL DEFAULT NULL")
            if 'last_price_date' not in batch_cols:
                await db.execute("ALTER TABLE batches ADD COLUMN last_price_date TEXT DEFAULT NULL")

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
                    quantity_change REAL NOT NULL,
                    reason TEXT DEFAULT 'consumed',
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    meal_type TEXT DEFAULT NULL,
                    FOREIGN KEY (barcode) REFERENCES products(barcode) ON DELETE CASCADE
                )
            """)

            # Migration: add meal_type column to existing movements table
            async with db.execute("PRAGMA table_info(movements)") as cursor:
                movement_cols = [row[1] for row in await cursor.fetchall()]
            if 'meal_type' not in movement_cols:
                await db.execute("ALTER TABLE movements ADD COLUMN meal_type TEXT DEFAULT NULL")
            if 'scale_id' not in movement_cols:
                await db.execute("ALTER TABLE movements ADD COLUMN scale_id INTEGER DEFAULT NULL")

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

            # Create recipes table
            await db.execute("""
                CREATE TABLE IF NOT EXISTS recipes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    description TEXT,
                    instructions TEXT,
                    servings INTEGER DEFAULT 1,
                    time INTEGER DEFAULT NULL,
                    tags TEXT DEFAULT '[]',
                    output_product_id TEXT DEFAULT NULL,
                    output_qty REAL DEFAULT 0,
                    default_expiry_days INTEGER DEFAULT NULL,
                    kcal REAL,
                    proteins REAL,
                    carbs REAL,
                    fat REAL,
                    image_url TEXT
                )
            """)

            # Migration: add new columns to existing recipes table
            async with db.execute("PRAGMA table_info(recipes)") as cursor:
                recipe_cols = [row[1] for row in await cursor.fetchall()]
            if 'time' not in recipe_cols:
                await db.execute("ALTER TABLE recipes ADD COLUMN time INTEGER DEFAULT NULL")
            if 'tags' not in recipe_cols:
                await db.execute("ALTER TABLE recipes ADD COLUMN tags TEXT DEFAULT '[]'")
            if 'output_product_id' not in recipe_cols:
                await db.execute("ALTER TABLE recipes ADD COLUMN output_product_id TEXT DEFAULT NULL")
            if 'output_qty' not in recipe_cols:
                await db.execute("ALTER TABLE recipes ADD COLUMN output_qty REAL DEFAULT 0")
            if 'default_expiry_days' not in recipe_cols:
                await db.execute("ALTER TABLE recipes ADD COLUMN default_expiry_days INTEGER DEFAULT NULL")
            if 'meal_types' not in recipe_cols:
                await db.execute("ALTER TABLE recipes ADD COLUMN meal_types TEXT DEFAULT '[]'")
            if 'fridge_expiry_days' not in recipe_cols:
                await db.execute("ALTER TABLE recipes ADD COLUMN fridge_expiry_days INTEGER DEFAULT NULL")
            if 'freezer_expiry_days' not in recipe_cols:
                await db.execute("ALTER TABLE recipes ADD COLUMN freezer_expiry_days INTEGER DEFAULT NULL")

            # Create recipe_ingredients table
            await db.execute("""
                CREATE TABLE IF NOT EXISTS recipe_ingredients (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    recipe_id INTEGER NOT NULL,
                    product_barcode TEXT,
                    custom_name TEXT,
                    quantity REAL NOT NULL,
                    unit TEXT NOT NULL,
                    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
                    FOREIGN KEY (product_barcode) REFERENCES products(barcode) ON DELETE SET NULL
                )
            """)

            # Create diet_plans table
            await db.execute("""
                CREATE TABLE IF NOT EXISTS diet_plans (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date TEXT NOT NULL,
                    meal_type TEXT NOT NULL,
                    recipe_id INTEGER,
                    product_barcode TEXT,
                    custom_name TEXT,
                    quantity REAL DEFAULT 1,
                    is_consumed INTEGER DEFAULT 0,
                    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL,
                    FOREIGN KEY (product_barcode) REFERENCES products(barcode) ON DELETE SET NULL
                )
            """)

            # Create weight_log table
            await db.execute("""
                CREATE TABLE IF NOT EXISTS weight_log (
                    date TEXT PRIMARY KEY,
                    weight REAL NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # Create scales table (smart scale integration — ESP32 + HX711)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS scales (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    ha_entity_id TEXT DEFAULT NULL,
                    product_barcode TEXT DEFAULT NULL,
                    batch_id INTEGER DEFAULT NULL,
                    tare_g REAL NOT NULL DEFAULT 0,
                    last_stable_weight_g REAL DEFAULT NULL,
                    last_event_weight_g REAL DEFAULT NULL,
                    last_event_at TIMESTAMP DEFAULT NULL,
                    calibration_factor REAL NOT NULL DEFAULT 1.0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (product_barcode) REFERENCES products(barcode) ON DELETE SET NULL,
                    FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE SET NULL
                )
            """)

            # Create price_history table — every observed purchase price for a
            # product (sourced from ticket PDF / manual entry). We also keep
            # last_price/last_price_date on the product itself for fast access,
            # plus optional batch_id to tie an observation to a specific batch.
            await db.execute("""
                CREATE TABLE IF NOT EXISTS price_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    barcode TEXT NOT NULL,
                    batch_id INTEGER DEFAULT NULL,
                    unit_price REAL NOT NULL,
                    qty REAL DEFAULT NULL,
                    total_price REAL DEFAULT NULL,
                    source TEXT NOT NULL DEFAULT 'manual',
                    source_ref TEXT DEFAULT NULL,
                    observed_at TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (barcode) REFERENCES products(barcode) ON DELETE CASCADE,
                    FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE SET NULL
                )
            """)
            await db.execute(
                "CREATE INDEX IF NOT EXISTS idx_price_history_barcode_date "
                "ON price_history(barcode, observed_at DESC)"
            )
            # Migration: add batch_id to pre-existing price_history rows.
            async with db.execute("PRAGMA table_info(price_history)") as cursor:
                ph_cols = [row[1] for row in await cursor.fetchall()]
            if 'batch_id' not in ph_cols:
                await db.execute("ALTER TABLE price_history ADD COLUMN batch_id INTEGER DEFAULT NULL")
            await db.execute(
                "CREATE INDEX IF NOT EXISTS idx_price_history_batch ON price_history(batch_id)"
            )

            # Create pending_refills table (bridge between scanner/ticket detection
            # and physical NUEVO LOTE button press on the scale)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS pending_refills (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    product_barcode TEXT NOT NULL,
                    qty_estimated REAL NOT NULL,
                    source TEXT NOT NULL,
                    source_meta TEXT DEFAULT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    resolved_at TIMESTAMP DEFAULT NULL,
                    resolved_batch_id INTEGER DEFAULT NULL,
                    FOREIGN KEY (product_barcode) REFERENCES products(barcode) ON DELETE CASCADE,
                    FOREIGN KEY (resolved_batch_id) REFERENCES batches(id) ON DELETE SET NULL
                )
            """)

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
                """INSERT INTO products (barcode, name, category, stock, min_stock, unit_type, location, image_url, weight_g, kcal_100g, proteins_100g, carbs_100g, fat_100g, serving_size, package_quantity, tracking_mode, scale_min_delta_g, last_updated)
                   VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (product.barcode, product.name, product.category, product.min_stock, product.unit_type, product.location, product.image_url,
                 product.weight_g, product.kcal_100g, product.proteins_100g, product.carbs_100g, product.fat_100g, product.serving_size, product.package_quantity, product.tracking_mode, product.scale_min_delta_g, datetime.now())
            )
            await db.commit()
        return await self.get_product(product.barcode)

    async def _log_movement(self, db, barcode: str, quantity_change: float, reason: str = "consumed", meal_type: Optional[str] = None):
        """Log a stock movement for traceability"""
        await db.execute(
            "INSERT INTO movements (barcode, quantity_change, reason, meal_type) VALUES (?, ?, ?, ?)",
            (barcode, quantity_change, reason, meal_type)
        )

    async def update_stock(self, barcode: str, update: StockUpdate) -> Optional[Product]:
        """Update product stock via batches"""
        affected_batch_id: Optional[int] = None
        async with aiosqlite.connect(self.db_path) as db:
            if update.quantity > 0:
                # Adding stock: find existing batch matching (barcode, location, expiry_date) or create new one.
                # NULL == NULL is treated as a match (both unspecified = same logical batch).
                db.row_factory = aiosqlite.Row
                if update.location is None and update.expiry_date is None:
                    async with db.execute(
                        "SELECT id FROM batches WHERE barcode = ? AND location IS NULL AND expiry_date IS NULL AND quantity > 0 LIMIT 1",
                        (barcode,)
                    ) as cursor:
                        row = await cursor.fetchone()
                elif update.location is None:
                    async with db.execute(
                        "SELECT id FROM batches WHERE barcode = ? AND location IS NULL AND expiry_date = ? AND quantity > 0 LIMIT 1",
                        (barcode, update.expiry_date)
                    ) as cursor:
                        row = await cursor.fetchone()
                elif update.expiry_date is None:
                    async with db.execute(
                        "SELECT id FROM batches WHERE barcode = ? AND location = ? AND expiry_date IS NULL AND quantity > 0 LIMIT 1",
                        (barcode, update.location)
                    ) as cursor:
                        row = await cursor.fetchone()
                else:
                    async with db.execute(
                        "SELECT id FROM batches WHERE barcode = ? AND location = ? AND expiry_date = ? AND quantity > 0 LIMIT 1",
                        (barcode, update.location, update.expiry_date)
                    ) as cursor:
                        row = await cursor.fetchone()

                if row:
                    # New purchase merging into an existing batch — if that batch
                    # already had a price, consolidate it now BEFORE overwriting,
                    # otherwise the prior observation is lost forever.
                    if update.unit_price is not None:
                        await self._consolidate_batch_price(db, row['id'])
                    await db.execute(
                        "UPDATE batches SET quantity = quantity + ? WHERE id = ?",
                        (update.quantity, row['id'])
                    )
                    affected_batch_id = row['id']
                else:
                    cursor = await db.execute(
                        "INSERT INTO batches (barcode, quantity, expiry_date, added_date, location) VALUES (?, ?, ?, ?, ?)",
                        (barcode, update.quantity, update.expiry_date, date.today().isoformat(), update.location)
                    )
                    affected_batch_id = cursor.lastrowid

                # Live price on the new/merged batch. Does NOT enter price_history
                # until the batch is consolidated (consumed to zero, rotated out).
                if update.unit_price is not None and affected_batch_id is not None:
                    observed_at = update.price_observed_at or datetime.now().isoformat(timespec="seconds")
                    await self._set_batch_price(db, affected_batch_id, barcode,
                                                update.unit_price, observed_at)
            else:
                # Removing stock: FIFO across batches.
                # If update.location is specified, restrict to batches at that location.
                remaining = abs(update.quantity)
                if update.location:
                    db.row_factory = aiosqlite.Row
                    async with db.execute(
                        """SELECT * FROM batches WHERE barcode = ? AND location = ? AND quantity > 0
                           ORDER BY CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END, expiry_date ASC""",
                        (barcode, update.location)
                    ) as cursor:
                        rows = await cursor.fetchall()
                        batches = [Batch(**dict(r)) for r in rows]
                else:
                    batches = await self._get_batches(db, barcode)
                for batch in batches:
                    if remaining <= 0:
                        break
                    consume = min(batch.quantity, remaining)
                    new_qty = batch.quantity - consume
                    if new_qty == 0:
                        # Batch exhausted — consolidate its live price as the
                        # final observation before removing the row.
                        await self._consolidate_batch_price(db, batch.id)
                        await db.execute("DELETE FROM batches WHERE id = ?", (batch.id,))
                    else:
                        await db.execute("UPDATE batches SET quantity = ? WHERE id = ?", (new_qty, batch.id))
                    remaining -= consume

            # Log movement with reason (default to "removed" if not specified)
            reason = update.reason or "removed"
            await self._log_movement(db, barcode, update.quantity, reason, update.meal_type)
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
        if update.unit_type is not None:
            updates['unit_type'] = update.unit_type
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
        if hasattr(update, 'serving_size') and update.serving_size is not None:
            updates['serving_size'] = update.serving_size
        if hasattr(update, 'package_quantity') and update.package_quantity is not None:
            updates['package_quantity'] = update.package_quantity
        if hasattr(update, 'tracking_mode') and update.tracking_mode is not None:
            updates['tracking_mode'] = update.tracking_mode
        if hasattr(update, 'scale_min_delta_g') and update.scale_min_delta_g is not None:
            updates['scale_min_delta_g'] = update.scale_min_delta_g

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
        """Update a batch's expiry date and/or location.

        Uses model_fields_set so that a JSON `null` (user explicitly clearing a
        value) is honored, while an absent field stays untouched. Treating
        `is not None` as "field was sent" would silently swallow clears."""
        async with aiosqlite.connect(self.db_path) as db:
            # Get batch to find its barcode
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM batches WHERE id = ?", (batch_id,)) as cursor:
                row = await cursor.fetchone()
                if not row:
                    return None
                barcode = row['barcode']

            sent = update.model_fields_set
            updates = {}
            if 'expiry_date' in sent:
                updates['expiry_date'] = update.expiry_date
            if 'location' in sent:
                updates['location'] = update.location

            if updates:
                set_clause = ', '.join(f"{k} = ?" for k in updates.keys())
                values = list(updates.values()) + [batch_id]
                await db.execute(f"UPDATE batches SET {set_clause} WHERE id = ?", values)

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
                await self._consolidate_batch_price(db, batch_id)
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

    async def get_frequent_products(self, days: int = 60, limit: int = 30) -> List[str]:
        """Return product barcodes most frequently consumed in the last N days, sorted by count desc."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("""
                SELECT barcode, COUNT(*) as freq
                FROM movements
                WHERE quantity_change < 0
                  AND timestamp >= date('now', ?)
                  AND barcode IS NOT NULL
                GROUP BY barcode
                ORDER BY freq DESC, MAX(timestamp) DESC
                LIMIT ?
            """, (f'-{days} days', limit)) as cursor:
                rows = await cursor.fetchall()
                return [row["barcode"] for row in rows]

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
                    SUM(CASE 
                        WHEN p.unit_type = 'uds' THEN ABS(m.quantity_change) * (IFNULL(p.weight_g, 100) / 100.0) * IFNULL(p.kcal_100g, 0)
                        ELSE ABS(m.quantity_change) / 100.0 * IFNULL(p.kcal_100g, 0)
                    END) as total_kcal,
                    SUM(CASE 
                        WHEN p.unit_type = 'uds' THEN ABS(m.quantity_change) * (IFNULL(p.weight_g, 100) / 100.0) * IFNULL(p.proteins_100g, 0)
                        ELSE ABS(m.quantity_change) / 100.0 * IFNULL(p.proteins_100g, 0)
                    END) as total_proteins,
                    SUM(CASE 
                        WHEN p.unit_type = 'uds' THEN ABS(m.quantity_change) * (IFNULL(p.weight_g, 100) / 100.0) * IFNULL(p.carbs_100g, 0)
                        ELSE ABS(m.quantity_change) / 100.0 * IFNULL(p.carbs_100g, 0)
                    END) as total_carbs,
                    SUM(CASE 
                        WHEN p.unit_type = 'uds' THEN ABS(m.quantity_change) * (IFNULL(p.weight_g, 100) / 100.0) * IFNULL(p.fat_100g, 0)
                        ELSE ABS(m.quantity_change) / 100.0 * IFNULL(p.fat_100g, 0)
                    END) as total_fat
                FROM movements m
                JOIN products p ON m.barcode = p.barcode
                WHERE m.quantity_change < 0 
                AND m.reason = 'consumed'
                AND date(m.timestamp) = date('now')
            """) as cursor:
                row = await cursor.fetchone()
                if row:
                    return dict(row)
                return {"total_kcal": 0, "total_proteins": 0, "total_carbs": 0, "total_fat": 0}

    async def get_daily_kcal_series(self, days: int = 30) -> List[dict]:
        """Return daily kcal consumed for the last N days. Includes days with zero consumption."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(f"""
                SELECT
                    date(m.timestamp) as date,
                    SUM(CASE
                        WHEN p.unit_type = 'uds' THEN ABS(m.quantity_change) * (IFNULL(p.weight_g, 100) / 100.0) * IFNULL(p.kcal_100g, 0)
                        ELSE ABS(m.quantity_change) / 100.0 * IFNULL(p.kcal_100g, 0)
                    END) as kcal
                FROM movements m
                JOIN products p ON m.barcode = p.barcode
                WHERE m.quantity_change < 0
                  AND m.reason = 'consumed'
                  AND date(m.timestamp) >= date('now', '-{int(days)} days')
                GROUP BY date(m.timestamp)
                ORDER BY date ASC
            """) as cursor:
                rows = await cursor.fetchall()
                return [{"date": r["date"], "kcal": r["kcal"] or 0} for r in rows]

    async def get_export_data(self) -> List[dict]:
        """Get all inventory data in a flat format for export. Product-level
        fields repeat across each batch row (denormalized) so the CSV can be
        edited in a spreadsheet. Price fields are aliased product_/batch_ to
        avoid a name collision in the joined row dict."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("""
                SELECT p.barcode, p.name, p.category, p.unit_type, p.location,
                       p.min_stock, p.image_url, p.weight_g,
                       p.kcal_100g, p.proteins_100g, p.carbs_100g, p.fat_100g,
                       p.serving_size, p.package_quantity,
                       p.last_price       AS product_last_price,
                       p.last_price_date  AS product_last_price_date,
                       b.quantity, b.expiry_date, b.location AS batch_location,
                       b.last_price       AS batch_last_price,
                       b.last_price_date  AS batch_last_price_date
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
                
                # Insert or update product. Price fields use the product_*
                # aliases from get_export_data; fall back to bare names so
                # older CSVs (or hand-edited ones) still import.
                p_last_price = item.get('product_last_price') if item.get('product_last_price') is not None else item.get('last_price')
                p_last_price_date = item.get('product_last_price_date') if item.get('product_last_price_date') is not None else item.get('last_price_date')
                await db.execute("""
                    INSERT INTO products (barcode, name, category, unit_type, location, min_stock, image_url, weight_g, kcal_100g, proteins_100g, carbs_100g, fat_100g, serving_size, package_quantity, last_price, last_price_date, stock, last_updated)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
                    ON CONFLICT(barcode) DO UPDATE SET
                        name=excluded.name,
                        category=excluded.category,
                        unit_type=excluded.unit_type,
                        location=excluded.location,
                        min_stock=excluded.min_stock,
                        image_url=COALESCE(excluded.image_url, products.image_url),
                        weight_g=COALESCE(excluded.weight_g, products.weight_g),
                        kcal_100g=COALESCE(excluded.kcal_100g, products.kcal_100g),
                        proteins_100g=COALESCE(excluded.proteins_100g, products.proteins_100g),
                        carbs_100g=COALESCE(excluded.carbs_100g, products.carbs_100g),
                        fat_100g=COALESCE(excluded.fat_100g, products.fat_100g),
                        serving_size=COALESCE(excluded.serving_size, products.serving_size),
                        package_quantity=COALESCE(excluded.package_quantity, products.package_quantity),
                        last_price=COALESCE(excluded.last_price, products.last_price),
                        last_price_date=COALESCE(excluded.last_price_date, products.last_price_date),
                        last_updated=excluded.last_updated
                """, (
                    barcode, item.get('name', 'Huerfano'), item.get('category', 'Otros'), item.get('unit_type', 'uds'),
                    item.get('location'), item.get('min_stock', 2), item.get('image_url'),
                    item.get('weight_g'), item.get('kcal_100g'), item.get('proteins_100g'),
                    item.get('carbs_100g'), item.get('fat_100g'), item.get('serving_size'), item.get('package_quantity'),
                    p_last_price, p_last_price_date, datetime.now()
                ))

                # Insert batch if quantity > 0. Batch-level price/location use
                # the batch_* aliases when present.
                qty = item.get('quantity')
                if qty and float(qty) > 0:
                    await db.execute("""
                        INSERT INTO batches (barcode, quantity, expiry_date, added_date, location, last_price, last_price_date)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (
                        barcode,
                        float(qty),
                        item.get('expiry_date'),
                        date.today().isoformat(),
                        item.get('batch_location'),
                        item.get('batch_last_price'),
                        item.get('batch_last_price_date'),
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
            
    async def get_today_movements(self) -> List[dict]:
        """Get list of products consumed today with full macro fields"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("""
                SELECT m.id, m.meal_type, m.quantity_change, m.timestamp,
                       p.name, p.barcode, p.unit_type, p.weight_g,
                       p.kcal_100g, p.proteins_100g, p.carbs_100g, p.fat_100g
                FROM movements m
                JOIN products p ON m.barcode = p.barcode
                WHERE m.quantity_change < 0
                AND m.reason = 'consumed'
                AND date(m.timestamp) = date('now')
                ORDER BY m.timestamp ASC
            """) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]

    async def delete_movement(self, movement_id: int, restore_stock: bool = True) -> bool:
        """Delete a movement and optionally restore stock"""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            # 1. Get movement details
            async with db.execute("SELECT * FROM movements WHERE id = ?", (movement_id,)) as cursor:
                movement = await cursor.fetchone()
                if not movement:
                    return False
            
            barcode = movement['barcode']
            qty_restored = abs(movement['quantity_change'])
            
            # 2. Add stock back (if it was a consumption AND restore_stock is True)
            if restore_stock and movement['quantity_change'] < 0:
                # Find oldest batch to put stock back or create one
                async with db.execute(
                    "SELECT id FROM batches WHERE barcode = ? ORDER BY expiry_date ASC LIMIT 1",
                    (barcode,)
                ) as cursor:
                    batch = await cursor.fetchone()
                
                if batch:
                    await db.execute("UPDATE batches SET quantity = quantity + ? WHERE id = ?", (qty_restored, batch['id']))
                else:
                    await db.execute(
                        "INSERT INTO batches (barcode, quantity, added_date) VALUES (?, ?, ?)",
                        (barcode, qty_restored, date.today().isoformat())
                    )
                
                await self._sync_product_stock(db, barcode)

            # 3. Delete movement
            await db.execute("DELETE FROM movements WHERE id = ?", (movement_id,))
            await db.commit()
            return True

    async def update_movement_quantity(self, movement_id: int, new_quantity: float) -> Optional[dict]:
        """Atomically adjust a movement's quantity_change and reconcile stock."""
        if new_quantity <= 0:
            return None  # caller should refuse with 400 before reaching here

        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row

            # 1. Fetch current movement
            async with db.execute("SELECT * FROM movements WHERE id = ?", (movement_id,)) as cursor:
                movement = await cursor.fetchone()
                if not movement:
                    return None

            barcode = movement['barcode']
            old_abs = abs(movement['quantity_change'])
            new_abs = new_quantity
            delta = new_abs - old_abs  # positive = consume more, negative = restore

            if delta > 0:
                # User under-reported: consume delta more from stock (FIFO batches)
                remaining = delta
                batches = await self._get_batches(db, barcode)
                for batch in batches:
                    if remaining <= 0:
                        break
                    consume = min(batch.quantity, remaining)
                    new_qty = batch.quantity - consume
                    if new_qty == 0:
                        await self._consolidate_batch_price(db, batch.id)
                        await db.execute("DELETE FROM batches WHERE id = ?", (batch.id,))
                    else:
                        await db.execute("UPDATE batches SET quantity = ? WHERE id = ?", (new_qty, batch.id))
                    remaining -= consume
            elif delta < 0:
                # User over-reported: restore abs(delta) to stock
                qty_restored = abs(delta)
                async with db.execute(
                    "SELECT id FROM batches WHERE barcode = ? ORDER BY expiry_date ASC LIMIT 1",
                    (barcode,)
                ) as cursor:
                    batch = await cursor.fetchone()

                if batch:
                    await db.execute("UPDATE batches SET quantity = quantity + ? WHERE id = ?", (qty_restored, batch['id']))
                else:
                    await db.execute(
                        "INSERT INTO batches (barcode, quantity, added_date) VALUES (?, ?, ?)",
                        (barcode, qty_restored, date.today().isoformat())
                    )

            # 2. Update movement row: preserve reason, meal_type, timestamp
            await db.execute(
                "UPDATE movements SET quantity_change = ? WHERE id = ?",
                (-new_abs, movement_id)
            )

            await self._sync_product_stock(db, barcode)
            await db.commit()

            # 3. Return updated movement dict
            async with db.execute("SELECT * FROM movements WHERE id = ?", (movement_id,)) as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None

    # --- Recipes Methods ---

    def _parse_recipe_row(self, recipe_dict: dict) -> dict:
        """Deserialize JSON fields from a recipe DB row."""
        tags_raw = recipe_dict.get('tags') or '[]'
        try:
            recipe_dict['tags'] = json.loads(tags_raw) if isinstance(tags_raw, str) else tags_raw
        except Exception:
            recipe_dict['tags'] = []
        meal_types_raw = recipe_dict.get('meal_types') or '[]'
        try:
            recipe_dict['meal_types'] = json.loads(meal_types_raw) if isinstance(meal_types_raw, str) else meal_types_raw
        except Exception:
            recipe_dict['meal_types'] = []
        return recipe_dict

    async def get_all_recipes(self) -> List[Recipe]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM recipes ORDER BY name") as cursor:
                recipe_rows = await cursor.fetchall()

            recipes = []
            for r_row in recipe_rows:
                recipe_dict = self._parse_recipe_row(dict(r_row))
                async with db.execute("SELECT * FROM recipe_ingredients WHERE recipe_id = ?", (recipe_dict['id'],)) as i_cursor:
                    ingredients = [Ingredient(**dict(i_row)) for i_row in await i_cursor.fetchall()]
                recipe_dict['ingredients'] = ingredients
                recipes.append(Recipe(**recipe_dict))
            return recipes

    async def get_recipe(self, recipe_id: int) -> Optional[Recipe]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM recipes WHERE id = ?", (recipe_id,)) as cursor:
                row = await cursor.fetchone()
                if not row: return None
                recipe_dict = self._parse_recipe_row(dict(row))
                async with db.execute("SELECT * FROM recipe_ingredients WHERE recipe_id = ?", (recipe_id,)) as i_cursor:
                    ingredients = [Ingredient(**dict(i_row)) for i_row in await i_cursor.fetchall()]
                recipe_dict['ingredients'] = ingredients
                return Recipe(**recipe_dict)

    async def create_recipe(self, recipe: RecipeCreate) -> Recipe:
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute("""
                INSERT INTO recipes (name, description, instructions, servings, time, tags, meal_types, output_product_id, output_qty, default_expiry_days, fridge_expiry_days, freezer_expiry_days, kcal, proteins, carbs, fat, image_url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                recipe.name, recipe.description, recipe.instructions, recipe.servings,
                recipe.time, json.dumps(recipe.tags or []), json.dumps(recipe.meal_types or []),
                recipe.output_product_id, recipe.output_qty, recipe.default_expiry_days,
                recipe.fridge_expiry_days, recipe.freezer_expiry_days,
                recipe.kcal, recipe.proteins, recipe.carbs, recipe.fat, recipe.image_url
            ))
            recipe_id = cursor.lastrowid

            for ing in recipe.ingredients:
                await db.execute("""
                    INSERT INTO recipe_ingredients (recipe_id, product_barcode, custom_name, quantity, unit)
                    VALUES (?, ?, ?, ?, ?)
                """, (recipe_id, ing.get('product_barcode'), ing.get('custom_name'), ing.get('quantity'), ing.get('unit', 'g')))

            await db.commit()
            return await self.get_recipe(recipe_id)

    async def update_recipe(self, recipe_id: int, recipe: RecipeCreate) -> Optional[Recipe]:
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                UPDATE recipes SET name=?, description=?, instructions=?, servings=?,
                time=?, tags=?, meal_types=?, output_product_id=?, output_qty=?, default_expiry_days=?,
                fridge_expiry_days=?, freezer_expiry_days=?,
                kcal=?, proteins=?, carbs=?, fat=?, image_url=?
                WHERE id=?
            """, (
                recipe.name, recipe.description, recipe.instructions, recipe.servings,
                recipe.time, json.dumps(recipe.tags or []), json.dumps(recipe.meal_types or []),
                recipe.output_product_id, recipe.output_qty, recipe.default_expiry_days,
                recipe.fridge_expiry_days, recipe.freezer_expiry_days,
                recipe.kcal, recipe.proteins, recipe.carbs, recipe.fat, recipe.image_url,
                recipe_id
            ))
            await db.execute("DELETE FROM recipe_ingredients WHERE recipe_id=?", (recipe_id,))
            for ing in recipe.ingredients:
                await db.execute("""
                    INSERT INTO recipe_ingredients (recipe_id, product_barcode, custom_name, quantity, unit)
                    VALUES (?, ?, ?, ?, ?)
                """, (recipe_id, ing.get('product_barcode'), ing.get('custom_name'), ing.get('quantity'), ing.get('unit', 'g')))
            await db.commit()
        return await self.get_recipe(recipe_id)

    async def delete_recipe(self, recipe_id: int) -> bool:
        async with aiosqlite.connect(self.db_path) as db:
            # Cascades should handle ingredient deletion
            cursor = await db.execute("DELETE FROM recipes WHERE id = ?", (recipe_id,))
            await db.commit()
            return cursor.rowcount > 0

    # --- Diet Plan Methods ---

    async def get_diet_plans(self, start_date: str, end_date: str) -> List[DietPlan]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("""
                SELECT * FROM diet_plans 
                WHERE date BETWEEN ? AND ? 
                ORDER BY date ASC, meal_type DESC
            """, (start_date, end_date)) as cursor:
                rows = await cursor.fetchall()
                return [DietPlan(**dict(row)) for row in rows]

    async def create_diet_plan(self, plan: DietPlanCreate) -> DietPlan:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("""
                INSERT INTO diet_plans (date, meal_type, recipe_id, product_barcode, custom_name, quantity, is_consumed)
                VALUES (?, ?, ?, ?, ?, ?, 0)
            """, (plan.date, plan.meal_type, plan.recipe_id, plan.product_barcode, plan.custom_name, plan.quantity))
            plan_id = cursor.lastrowid
            await db.commit()
            
            async with db.execute("SELECT * FROM diet_plans WHERE id = ?", (plan_id,)) as c:
                row = await c.fetchone()
                return DietPlan(**dict(row))

    async def update_diet_plan(self, plan_id: int, is_consumed: bool):
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("UPDATE diet_plans SET is_consumed = ? WHERE id = ?", (1 if is_consumed else 0, plan_id))
            await db.commit()

    async def delete_diet_plan(self, plan_id: int) -> bool:
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute("DELETE FROM diet_plans WHERE id = ?", (plan_id,))
            await db.commit()
            return cursor.rowcount > 0

    async def save_body_weight(self, weight: float, date_str: Optional[str] = None) -> dict:
        """Upsert today's (or given date's) body weight."""
        from datetime import date as _date
        d = date_str or _date.today().isoformat()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "INSERT INTO weight_log (date, weight) VALUES (?, ?) "
                "ON CONFLICT(date) DO UPDATE SET weight = excluded.weight, created_at = CURRENT_TIMESTAMP",
                (d, weight)
            )
            await db.commit()
        return {"date": d, "weight": weight}

    async def get_body_weights(self) -> List[dict]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT date, weight, created_at FROM weight_log ORDER BY date ASC") as cursor:
                rows = await cursor.fetchall()
                return [dict(r) for r in rows]

    async def get_latest_body_weight(self) -> Optional[dict]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT date, weight, created_at FROM weight_log ORDER BY date DESC LIMIT 1") as cursor:
                row = await cursor.fetchone()
                return dict(row) if row else None

    # =======================================================================
    # Smart Scale (ESP32 + HX711) — methods
    # =======================================================================

    def _meal_type_from_hour(self, hour: int) -> str:
        """Auto-assign a meal slot from the hour of day. User accepted occasional
        misclassification because the daily kcal total is what matters."""
        if   5 <= hour < 10: return 'desayuno'
        elif 10 <= hour < 12: return 'almuerzo'
        elif 12 <= hour < 16: return 'comida'
        elif 16 <= hour < 19: return 'merienda'
        else:                 return 'cena'  # 19-24 and 0-5

    async def get_all_scales(self) -> List[Scale]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM scales ORDER BY name") as cursor:
                rows = await cursor.fetchall()
            return [Scale(**dict(r)) for r in rows]

    async def get_scale(self, scale_id: int) -> Optional[Scale]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM scales WHERE id = ?", (scale_id,)) as cursor:
                row = await cursor.fetchone()
            return Scale(**dict(row)) if row else None

    async def create_scale(self, scale: ScaleCreate) -> Scale:
        async with aiosqlite.connect(self.db_path) as db:
            # Pick the lowest free id by walking existing ids in order. AUTOINCREMENT
            # on the table doesn't help here — it never reuses, so deleting scale 1
            # and re-creating jumps to 2, 3, … forever and the ESP firmware's
            # hardcoded SCALE_ID drifts out of sync. With explicit ids we fill gaps
            # left by deletions, keeping the firmware mapping stable.
            async with db.execute("SELECT id FROM scales ORDER BY id") as cursor:
                existing = [row[0] for row in await cursor.fetchall()]
            scale_id = 1
            for eid in existing:
                if eid == scale_id:
                    scale_id += 1
                else:
                    break
            await db.execute(
                """INSERT INTO scales (id, name, ha_entity_id, product_barcode, tare_g, calibration_factor)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (scale_id, scale.name, scale.ha_entity_id, scale.product_barcode,
                 scale.tare_g, scale.calibration_factor)
            )
            await db.commit()
        return await self.get_scale(scale_id)

    async def update_scale(self, scale_id: int, update: ScaleUpdate) -> Optional[Scale]:
        existing = await self.get_scale(scale_id)
        if not existing:
            return None
        updates = {}
        for field in ('name', 'ha_entity_id', 'product_barcode', 'batch_id',
                      'tare_g', 'calibration_factor'):
            val = getattr(update, field, None)
            if val is not None:
                updates[field] = val
        if updates:
            set_clause = ', '.join(f"{k} = ?" for k in updates.keys())
            values = list(updates.values()) + [scale_id]
            async with aiosqlite.connect(self.db_path) as db:
                await db.execute(f"UPDATE scales SET {set_clause} WHERE id = ?", values)
                await db.commit()
        return await self.get_scale(scale_id)

    async def delete_scale(self, scale_id: int) -> bool:
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute("DELETE FROM scales WHERE id = ?", (scale_id,))
            await db.commit()
            return cursor.rowcount > 0

    async def record_scale_weight(self, scale_id: int, weight_g: float) -> Optional[Scale]:
        """Stable weight reading from the ESP32. Always refreshes the scale's
        last_stable_weight_g. If the scale is bound to a product+batch and the
        change vs. the previous stable reading exceeds the product's
        scale_min_delta_g threshold, the batch quantity is synced to the new
        weight so the pantry view tracks it live. Never creates a movement —
        consumption events go through handle_scale_event('consumo')."""
        scale = await self.get_scale(scale_id)
        if not scale:
            return None
        prev_weight = scale.last_stable_weight_g
        product = None
        if scale.product_barcode:
            product = await self.get_product(scale.product_barcode)
        should_sync_stock = (
            product is not None
            and product.tracking_mode == "scale"
            and scale.batch_id is not None
            and (prev_weight is None or abs(weight_g - prev_weight) >= product.scale_min_delta_g)
        )
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "UPDATE scales SET last_stable_weight_g = ? WHERE id = ?",
                (weight_g, scale_id)
            )
            if should_sync_stock:
                await db.execute(
                    "UPDATE batches SET quantity = ? WHERE id = ?",
                    (max(0.0, weight_g), scale.batch_id)
                )
                await self._sync_product_stock(db, scale.product_barcode)
            await db.commit()
        return await self.get_scale(scale_id)

    async def handle_scale_event(self, scale_id: int, event_type: str,
                                 weight_g: float) -> Optional[dict]:
        """Dispatch a physical button event. Returns a summary of what happened
        (or None if scale not found / unknown event)."""
        scale = await self.get_scale(scale_id)
        if not scale:
            return None

        now = datetime.now()
        result = {"scale_id": scale_id, "type": event_type, "weight_g": weight_g}

        if event_type == "tare":
            async with aiosqlite.connect(self.db_path) as db:
                await db.execute(
                    """UPDATE scales SET last_event_weight_g = ?, last_event_at = ?,
                       tare_g = ?, last_stable_weight_g = ? WHERE id = ?""",
                    (weight_g, now, weight_g, weight_g, scale_id)
                )
                await db.commit()
            result["action"] = "tare"

        elif event_type == "consumo":
            previous = scale.last_event_weight_g if scale.last_event_weight_g is not None else weight_g
            consumed = max(0.0, previous - weight_g)
            meal_type = self._meal_type_from_hour(now.hour)
            async with aiosqlite.connect(self.db_path) as db:
                if consumed > 0 and scale.product_barcode:
                    await db.execute(
                        """INSERT INTO movements (barcode, quantity_change, reason, meal_type, scale_id)
                           VALUES (?, ?, ?, ?, ?)""",
                        (scale.product_barcode, -consumed, "consumed_via_scale",
                         meal_type, scale.id)
                    )
                    if scale.batch_id:
                        await db.execute(
                            "UPDATE batches SET quantity = MAX(0, quantity - ?) WHERE id = ?",
                            (consumed, scale.batch_id)
                        )
                    await self._sync_product_stock(db, scale.product_barcode)
                await db.execute(
                    """UPDATE scales SET last_event_weight_g = ?, last_event_at = ?,
                       last_stable_weight_g = ? WHERE id = ?""",
                    (weight_g, now, weight_g, scale_id)
                )
                await db.commit()
            result.update({"action": "consumo", "consumed_g": consumed,
                           "meal_type": meal_type})

        elif event_type == "nuevo_lote":
            new_batch_id = None
            resolved_refill_id = None
            async with aiosqlite.connect(self.db_path) as db:
                if scale.product_barcode:
                    location_label = f"Báscula: {scale.name}"
                    if scale.batch_id:
                        # Lot rotation: the previous scale-bound batch is gone — drop it,
                        # but first freeze its live price as a price_history observation.
                        await self._consolidate_batch_price(db, scale.batch_id)
                        await db.execute(
                            "DELETE FROM batches WHERE id = ?",
                            (scale.batch_id,)
                        )
                    else:
                        # First NUEVO LOTE for this scale: any pre-existing batches of
                        # the same product without an explicit location, or already
                        # living at this scale's location label, are stale estimates
                        # the live weight is now superseding. Batches in OTHER explicit
                        # locations (Nevera, Despensa, Congelador, Otros, or a different
                        # scale's label) are kept — those are stocks this scale doesn't
                        # control.
                        db.row_factory = aiosqlite.Row
                        async with db.execute(
                            """SELECT id FROM batches
                               WHERE barcode = ? AND (location IS NULL OR location = ?)""",
                            (scale.product_barcode, location_label)
                        ) as cursor:
                            stale_ids = [r["id"] for r in await cursor.fetchall()]
                        for sid in stale_ids:
                            await self._consolidate_batch_price(db, sid)
                        await db.execute(
                            """DELETE FROM batches
                               WHERE barcode = ? AND (location IS NULL OR location = ?)""",
                            (scale.product_barcode, location_label)
                        )
                    cursor = await db.execute(
                        """INSERT INTO batches (barcode, quantity, expiry_date, added_date, location)
                           VALUES (?, ?, ?, ?, ?)""",
                        (scale.product_barcode, weight_g, None,
                         date.today().isoformat(), location_label)
                    )
                    new_batch_id = cursor.lastrowid
                    await db.execute(
                        """INSERT INTO movements (barcode, quantity_change, reason, scale_id)
                           VALUES (?, ?, ?, ?)""",
                        (scale.product_barcode, weight_g, "scale_new_batch", scale.id)
                    )
                    # Resolve oldest pending refill for this product, if any.
                    db.row_factory = aiosqlite.Row
                    async with db.execute(
                        """SELECT id FROM pending_refills
                           WHERE product_barcode = ? AND status = 'pending'
                           ORDER BY created_at ASC LIMIT 1""",
                        (scale.product_barcode,)
                    ) as cursor:
                        refill_row = await cursor.fetchone()
                    if refill_row:
                        resolved_refill_id = refill_row['id']
                        await db.execute(
                            """UPDATE pending_refills SET status = 'resolved',
                               resolved_at = ?, resolved_batch_id = ? WHERE id = ?""",
                            (now, new_batch_id, resolved_refill_id)
                        )
                    await self._sync_product_stock(db, scale.product_barcode)
                await db.execute(
                    """UPDATE scales SET batch_id = ?, last_event_weight_g = ?,
                       last_event_at = ?, last_stable_weight_g = ? WHERE id = ?""",
                    (new_batch_id, weight_g, now, weight_g, scale_id)
                )
                await db.commit()
            result.update({"action": "nuevo_lote", "new_batch_id": new_batch_id,
                           "resolved_pending_refill_id": resolved_refill_id})

        else:
            return None

        return result

    # --- Pending refills ---------------------------------------------------

    async def list_pending_refills(self, status: Optional[str] = None) -> List[PendingRefill]:
        query = "SELECT * FROM pending_refills"
        params: list = []
        if status:
            query += " WHERE status = ?"
            params.append(status)
        query += " ORDER BY created_at DESC"
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(query, params) as cursor:
                rows = await cursor.fetchall()
            return [PendingRefill(**dict(r)) for r in rows]

    async def create_pending_refill(self, refill: PendingRefillCreate) -> PendingRefill:
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(
                """INSERT INTO pending_refills (product_barcode, qty_estimated, source, source_meta)
                   VALUES (?, ?, ?, ?)""",
                (refill.product_barcode, refill.qty_estimated, refill.source, refill.source_meta)
            )
            refill_id = cursor.lastrowid
            await db.commit()
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM pending_refills WHERE id = ?", (refill_id,)) as cursor:
                row = await cursor.fetchone()
            return PendingRefill(**dict(row))

    async def resolve_pending_refill_now(self, refill_id: int,
                                         actual_qty: float) -> Optional[dict]:
        """User chose 'add now' instead of waiting for NUEVO LOTE — create the
        batch immediately with the given quantity and mark the refill resolved.
        A future NUEVO LOTE press will then create its own batch on top."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM pending_refills WHERE id = ? AND status = 'pending'",
                (refill_id,)
            ) as cursor:
                row = await cursor.fetchone()
            if not row:
                return None
            barcode = row['product_barcode']

            cursor = await db.execute(
                """INSERT INTO batches (barcode, quantity, expiry_date, added_date, location)
                   VALUES (?, ?, ?, ?, ?)""",
                (barcode, actual_qty, None, date.today().isoformat(), None)
            )
            new_batch_id = cursor.lastrowid

            await db.execute(
                """INSERT INTO movements (barcode, quantity_change, reason)
                   VALUES (?, ?, ?)""",
                (barcode, actual_qty, "pending_refill_resolved")
            )

            await db.execute(
                """UPDATE pending_refills SET status = 'resolved',
                   resolved_at = ?, resolved_batch_id = ? WHERE id = ?""",
                (datetime.now(), new_batch_id, refill_id)
            )

            await self._sync_product_stock(db, barcode)
            await db.commit()
        return {"refill_id": refill_id, "new_batch_id": new_batch_id, "qty": actual_qty}

    async def delete_pending_refill(self, refill_id: int) -> bool:
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute("DELETE FROM pending_refills WHERE id = ?", (refill_id,))
            await db.commit()
            return cursor.rowcount > 0

    # --- Price tracking ----------------------------------------------------
    #
    # Mental model (mind the difference from earlier versions):
    #   batches.last_price       → the *live* price of a batch. Mutable while
    #                              the batch has stock — corrections never
    #                              pollute the time series.
    #   products.last_price      → mirrors the most recent batch update so
    #                              the shopping list keeps a fast lookup.
    #   price_history            → *consolidated* observations only. A row
    #                              lands here when a batch is deleted (FIFO
    #                              consume to zero, manual drain, scale lot
    #                              rotation). That snapshot is what feeds the
    #                              chart.

    async def _set_batch_price(self, db, batch_id: int, barcode: str,
                                unit_price: float, observed_at: str):
        """Write batch.last_price and bump product.last_price if newer.
        Does NOT insert into price_history — this is the 'live' path."""
        db.row_factory = aiosqlite.Row
        await db.execute(
            "UPDATE batches SET last_price = ?, last_price_date = ? WHERE id = ?",
            (unit_price, observed_at, batch_id)
        )
        async with db.execute(
            "SELECT last_price_date FROM products WHERE barcode = ?", (barcode,)
        ) as cursor:
            prod = await cursor.fetchone()
        if not prod:
            return
        prev_date = prod["last_price_date"]
        if prev_date is None or observed_at >= prev_date:
            await db.execute(
                "UPDATE products SET last_price = ?, last_price_date = ?, last_updated = ? "
                "WHERE barcode = ?",
                (unit_price, observed_at, datetime.now(), barcode)
            )

    async def _consolidate_batch_price(self, db, batch_id: int):
        """Right before deleting a batch, freeze its current live price as a
        price_history row. No-op if the batch has no last_price."""
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT barcode, last_price, last_price_date, quantity FROM batches WHERE id = ?",
            (batch_id,)
        ) as cursor:
            row = await cursor.fetchone()
        if not row or row["last_price"] is None:
            return
        observed_at = row["last_price_date"] or datetime.now().isoformat(timespec="seconds")
        await db.execute(
            """INSERT INTO price_history
               (barcode, batch_id, unit_price, qty, total_price, source, source_ref, observed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (row["barcode"], batch_id, row["last_price"], None, None,
             "consolidated", None, observed_at)
        )

    async def record_price(self, barcode: str, record: PriceRecord) -> Optional[PriceHistoryEntry]:
        """Manually insert a price observation (e.g. user typing a price they
        remember). This is the ONLY public entry point that writes price_history
        directly — the ticket flow and batch edits route through _set_batch_price."""
        observed_at = record.observed_at or datetime.now().isoformat(timespec="seconds")
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT last_price_date FROM products WHERE barcode = ?", (barcode,)
            ) as cursor:
                prod = await cursor.fetchone()
            if not prod:
                return None
            cursor = await db.execute(
                """INSERT INTO price_history
                   (barcode, batch_id, unit_price, qty, total_price, source, source_ref, observed_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (barcode, record.batch_id, record.unit_price, record.qty, record.total_price,
                 record.source, record.source_ref, observed_at)
            )
            new_id = cursor.lastrowid
            prev_date = prod["last_price_date"]
            if prev_date is None or observed_at >= prev_date:
                await db.execute(
                    "UPDATE products SET last_price = ?, last_price_date = ?, last_updated = ? "
                    "WHERE barcode = ?",
                    (record.unit_price, observed_at, datetime.now(), barcode)
                )
            await db.commit()
            async with db.execute("SELECT * FROM price_history WHERE id = ?", (new_id,)) as cursor:
                row = await cursor.fetchone()
            return PriceHistoryEntry(**dict(row)) if row else None

    async def record_batch_price(self, batch_id: int, record: PriceRecord) -> Optional[Batch]:
        """Edit the live price of a specific batch (manual correction in the
        product card). Updates batch.last_price + product.last_price, but does
        NOT touch price_history — the correction is not a new observation."""
        observed_at = record.observed_at or datetime.now().isoformat(timespec="seconds")
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT barcode FROM batches WHERE id = ?", (batch_id,)
            ) as cursor:
                row = await cursor.fetchone()
            if not row:
                return None
            barcode = row["barcode"]
            await self._set_batch_price(db, batch_id, barcode, record.unit_price, observed_at)
            await db.commit()
            async with db.execute("SELECT * FROM batches WHERE id = ?", (batch_id,)) as cursor:
                updated = await cursor.fetchone()
            return Batch(**dict(updated)) if updated else None

    async def clear_price_history(self, barcode: str) -> int:
        """Wipe all price_history rows for a product. Returns the number deleted."""
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(
                "DELETE FROM price_history WHERE barcode = ?", (barcode,)
            )
            await db.commit()
            return cursor.rowcount

    async def get_price_history(self, barcode: str, limit: int = 50) -> List[PriceHistoryEntry]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM price_history WHERE barcode = ? "
                "ORDER BY observed_at DESC, id DESC LIMIT ?",
                (barcode, limit)
            ) as cursor:
                rows = await cursor.fetchall()
            return [PriceHistoryEntry(**dict(r)) for r in rows]

db = Database()
