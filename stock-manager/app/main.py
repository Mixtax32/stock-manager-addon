from fastapi import FastAPI, HTTPException, Request, File, UploadFile
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
import logging
from typing import List, Optional

from .database import db
from .models import (
    Product, ProductCreate, StockUpdate, ProductUpdate, Batch, BatchUpdate, BatchStockUpdate,
    MacroGoals, MacroGoalsUpdate, Recipe, RecipeCreate, DietPlan, DietPlanCreate,
    MovementUpdate, BodyWeight, BodyWeightCreate,
    Scale, ScaleCreate, ScaleUpdate, ScaleWeight, ScaleEvent,
    PendingRefill, PendingRefillCreate, PendingRefillResolve,
    PriceRecord, PriceHistoryEntry,
    CookSession, CookSessionCreate, CookStepConfirm, CookStepView,
)
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
    logger.info("Initializing Stock Manager v0.7.0.")
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

# Anti-cache middleware
@app.middleware("http")
async def add_custom_headers(request: Request, call_next):
    # Disable cache for all responses to fix browser issues in HA Ingress
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

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
                        "image_url": data.get("image_url"),
                        "package_quantity": data.get("package_quantity")
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
                    image_url=up.get("image_url"),
                    package_quantity=up.get("package_quantity")
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

@app.get("/api/stats/daily-kcal")
async def get_daily_kcal_series(days: int = 30):
    """Daily kcal consumed for the last N days."""
    return await db.get_daily_kcal_series(days)

@app.get("/api/stats/macro-goals", response_model=MacroGoals)
async def get_macro_goals():
    """Get daily macro goals"""
    return await db.get_macro_goals()

@app.patch("/api/stats/macro-goals", response_model=MacroGoals)
async def update_macro_goals(update: MacroGoalsUpdate):
    """Update daily macro goals"""
    return await db.update_macro_goals(update)

@app.post("/api/weight", response_model=BodyWeight)
async def post_weight(payload: BodyWeightCreate):
    result = await db.save_body_weight(payload.weight, payload.date)
    return result

@app.get("/api/weight", response_model=List[BodyWeight])
async def get_weights():
    return await db.get_body_weights()

@app.get("/api/weight/latest")
async def get_weight_latest():
    result = await db.get_latest_body_weight()
    return result or {}

@app.get("/api/stats/today-movements")
async def get_today_movements():
    """Get list of products consumed today"""
    return await db.get_today_movements()

@app.get("/api/stats/frequent-products")
async def get_frequent_products(days: int = 60, limit: int = 30):
    """List of product barcodes most frequently consumed (desc)."""
    return await db.get_frequent_products(days=days, limit=limit)

@app.delete("/api/movements/{movement_id}")
async def delete_movement(movement_id: int, restore_stock: bool = True):
    """Delete movement and optionally restore stock"""
    success = await db.delete_movement(movement_id, restore_stock)
    if not success:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")
    return {"message": "Movimiento eliminado"}

@app.patch("/api/movements/{movement_id}")
async def update_movement(movement_id: int, update: MovementUpdate):
    """Adjust the consumed quantity of a movement and reconcile stock."""
    if update.quantity <= 0:
        raise HTTPException(status_code=400, detail="La cantidad debe ser mayor a 0")
    result = await db.update_movement_quantity(movement_id, update.quantity)
    if not result:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")
    return result

@app.get("/api/export")
async def export_data():
    """Export all inventory data as CSV. Column order is derived from the rows
    themselves so any new field added to db.get_export_data() flows into the
    file automatically — nobody has to remember to extend a fieldnames list."""
    import csv
    import io
    from fastapi.responses import StreamingResponse

    data = await db.get_export_data()

    if data:
        # All rows share keys (same SELECT) so the first row defines the schema.
        fieldnames = list(data[0].keys())
    else:
        # Empty inventory: still emit a header so the file is a valid CSV the
        # import endpoint can read back. This fallback only matters when the
        # DB has no products — the live case never touches it.
        fieldnames = [
            "barcode", "name", "category", "unit_type", "location", "min_stock",
            "image_url", "weight_g", "kcal_100g", "proteins_100g", "carbs_100g",
            "fat_100g", "serving_size", "package_quantity", "quantity", "expiry_date",
        ]

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(data)

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=inventario_stock.csv"}
    )

@app.post("/api/ocr/ticket")
async def ocr_ticket(file: UploadFile = File(...)):
    """Run OCR on a ticket image and return the parsed product lines."""
    from . import ocr_service
    try:
        content = await file.read()
        text = ocr_service.extract_text_from_image(content)
        lines = ocr_service.parse_ticket_items(text)
        return {"lines": lines, "raw": text}
    except Exception as e:
        logger.error(f"OCR ticket error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error procesando ticket: {str(e)}")

@app.post("/api/ocr/ticket-pdf")
async def ocr_ticket_pdf(file: UploadFile = File(...)):
    """Parse a Mercadona ticket PDF and return structured items with prices."""
    from . import ticket_pdf_service
    try:
        content = await file.read()
        result = ticket_pdf_service.parse_ticket_pdf(content)
        return result
    except Exception as e:
        logger.error(f"PDF ticket error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error procesando PDF: {str(e)}")

@app.post("/api/products/{barcode}/price", response_model=PriceHistoryEntry)
async def record_product_price(barcode: str, record: PriceRecord):
    """Record an observed purchase price for a product."""
    entry = await db.record_price(barcode, record)
    if not entry:
        raise HTTPException(status_code=404, detail="Product not found")
    return entry

@app.get("/api/products/{barcode}/price-history", response_model=List[PriceHistoryEntry])
async def get_product_price_history(barcode: str, limit: int = 50):
    """Get price history for a product, newest first."""
    return await db.get_price_history(barcode, limit)

@app.patch("/api/batches/{batch_id}/price", response_model=Batch)
async def patch_batch_price(batch_id: int, record: PriceRecord):
    """Edit the live price of a specific batch. This is a correction, NOT a new
    observation — it does not pollute price_history. The frozen observation only
    lands in price_history when the batch is consumed/rotated out."""
    updated = await db.record_batch_price(batch_id, record)
    if not updated:
        raise HTTPException(status_code=404, detail="Batch not found")
    return updated

@app.delete("/api/products/{barcode}/price-history")
async def delete_product_price_history(barcode: str):
    """Wipe all price_history rows for a product (e.g. after generating noisy
    test data while playing with the price input)."""
    deleted = await db.clear_price_history(barcode)
    return {"deleted": deleted}

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

# --- Recipes Endpoints ---

@app.get("/api/recipes", response_model=List[Recipe])
async def get_recipes():
    """Get all recipes"""
    return await db.get_all_recipes()

@app.get("/api/recipes/{recipe_id}", response_model=Recipe)
async def get_recipe(recipe_id: int):
    """Get recipe by id"""
    recipe = await db.get_recipe(recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipe

@app.post("/api/recipes", response_model=Recipe, status_code=201)
async def create_recipe(recipe: RecipeCreate):
    """Create new recipe"""
    return await db.create_recipe(recipe)

@app.put("/api/recipes/{recipe_id}", response_model=Recipe)
async def update_recipe(recipe_id: int, recipe: RecipeCreate):
    """Update an existing recipe"""
    updated = await db.update_recipe(recipe_id, recipe)
    if not updated:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return updated

@app.delete("/api/recipes/{recipe_id}", status_code=204)
async def delete_recipe(recipe_id: int):
    """Delete recipe"""
    success = await db.delete_recipe(recipe_id)
    if not success:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return None

@app.post("/api/recipes/{recipe_id}/consume")
async def consume_recipe(recipe_id: int, servings: float = 1.0):
    """Subtract recipe ingredients from stock"""
    recipe = await db.get_recipe(recipe_id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    
    # Process each ingredient
    consumed = []
    errors = []
    
    # We do a dry run first to check stock
    for ing in recipe.ingredients:
        if ing.product_barcode:
            product = await db.get_product(ing.product_barcode)
            needed = ing.quantity * servings
            if product.stock < needed:
                errors.append(f"Stock insuficiente para {product.name}: necesita {needed}{product.unit_type}, tiene {product.stock}")
    
    if errors:
        raise HTTPException(status_code=400, detail=" | ".join(errors))
    
    # Final run: actually consume
    for ing in recipe.ingredients:
        if ing.product_barcode:
            await db.update_stock(ing.product_barcode, StockUpdate(
                quantity=-(ing.quantity * servings),
                reason="consumed_in_recipe"
            ))
            consumed.append(ing.product_barcode)
            
    return {"message": f"Ingredientes de '{recipe.name}' consumidos del stock.", "consumed_barcodes": consumed}

# --- Diet Plan Endpoints ---

@app.get("/api/diet-plan", response_model=List[DietPlan])
async def get_diet_plans(start_date: str, end_date: str):
    """Get diet plans for a date range"""
    return await db.get_diet_plans(start_date, end_date)

@app.post("/api/diet-plan", response_model=DietPlan, status_code=201)
async def create_diet_plan(plan: DietPlanCreate):
    """Add a meal to the diet plan"""
    return await db.create_diet_plan(plan)

@app.patch("/api/diet-plan/{plan_id}", response_model=DietPlan)
async def update_diet_plan(plan_id: int, is_consumed: bool):
    """Mark a planned meal as consumed or not"""
    await db.update_diet_plan(plan_id, is_consumed)
    # Note: this doesn't automatically subtract from stock, user might want to do that manually 
    # or we could add an option here. For now, it's just a checkmark.
    return {"status": "updated"}

@app.delete("/api/diet-plan/{plan_id}", status_code=204)
async def delete_diet_plan(plan_id: int):
    """Remove a meal from the plan"""
    success = await db.delete_diet_plan(plan_id)
    if not success:
        raise HTTPException(status_code=404, detail="Plan not found")
    return None

# --- Smart Scale Endpoints (ESP32 + HX711 integration) --------------------

@app.get("/api/scales", response_model=List[Scale])
async def get_scales():
    """List all configured scales."""
    return await db.get_all_scales()

@app.get("/api/scales/{scale_id}", response_model=Scale)
async def get_scale(scale_id: int):
    scale = await db.get_scale(scale_id)
    if not scale:
        raise HTTPException(status_code=404, detail="Scale not found")
    return scale

@app.post("/api/scales", response_model=Scale, status_code=201)
async def create_scale(scale: ScaleCreate):
    return await db.create_scale(scale)

@app.patch("/api/scales/{scale_id}", response_model=Scale)
async def update_scale(scale_id: int, update: ScaleUpdate):
    result = await db.update_scale(scale_id, update)
    if not result:
        raise HTTPException(status_code=404, detail="Scale not found")
    return result

@app.delete("/api/scales/{scale_id}", status_code=204)
async def delete_scale(scale_id: int):
    success = await db.delete_scale(scale_id)
    if not success:
        raise HTTPException(status_code=404, detail="Scale not found")
    return None

@app.post("/api/scales/{scale_id}/weight")
async def post_scale_weight(scale_id: int, payload: ScaleWeight):
    """Webhook called by the ESP32 when a stable weight change is detected.
    Updates the live stock display only — no movement entry is created."""
    scale = await db.record_scale_weight(scale_id, payload.weight_g)
    if not scale:
        raise HTTPException(status_code=404, detail="Scale not found")
    return {"ok": True, "weight_g": payload.weight_g}

@app.post("/api/scales/{scale_id}/event")
async def post_scale_event(scale_id: int, payload: ScaleEvent):
    """Webhook called by the ESP32 when a physical button is pressed.
    Dispatches to tare / consumo / nuevo_lote handlers."""
    if payload.type not in ("tare", "consumo", "nuevo_lote"):
        raise HTTPException(status_code=400, detail=f"Unknown event type: {payload.type}")
    result = await db.handle_scale_event(scale_id, payload.type, payload.weight_g)
    if result is None:
        raise HTTPException(status_code=404, detail="Scale not found")
    return result

# --- Pending Refills ------------------------------------------------------

@app.get("/api/pending-refills", response_model=List[PendingRefill])
async def get_pending_refills(status: Optional[str] = None):
    """List pending refills. Optionally filter by status (pending|resolved|cancelled)."""
    return await db.list_pending_refills(status)

@app.post("/api/pending-refills", response_model=PendingRefill, status_code=201)
async def create_pending_refill(refill: PendingRefillCreate):
    """Create a pending refill — used by scanner/OCR when detecting a scale-mode product."""
    return await db.create_pending_refill(refill)

@app.post("/api/pending-refills/{refill_id}/resolve")
async def resolve_pending_refill(refill_id: int, payload: PendingRefillResolve):
    """Resolve a pending refill immediately with the given quantity (user chose
    'add now' instead of waiting for the NUEVO LOTE button)."""
    if payload.actual_qty <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than 0")
    result = await db.resolve_pending_refill_now(refill_id, payload.actual_qty)
    if not result:
        raise HTTPException(status_code=404, detail="Pending refill not found or already resolved")
    return result

@app.delete("/api/pending-refills/{refill_id}", status_code=204)
async def delete_pending_refill(refill_id: int):
    success = await db.delete_pending_refill(refill_id)
    if not success:
        raise HTTPException(status_code=404, detail="Pending refill not found")
    return None

# --- Cook Sessions (guided cook on a kitchen scale) -------------------------

@app.post("/api/cook-sessions", response_model=CookSession, status_code=201)
async def start_cook_session(payload: CookSessionCreate):
    """Start a guided cook session for a recipe on a kitchen scale. Builds one
    step per recipe ingredient. Fails if the scale already has an active session."""
    try:
        return await db.create_cook_session(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

@app.get("/api/cook-sessions/{session_id}", response_model=CookSession)
async def get_cook_session(session_id: int):
    session = await db.get_cook_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Cook session not found")
    return session

@app.post("/api/cook-sessions/{session_id}/confirm-step", response_model=CookSession)
async def confirm_cook_step(session_id: int, payload: CookStepConfirm):
    try:
        session = await db.confirm_cook_step(session_id, payload.actual_qty, skip=False)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not session:
        raise HTTPException(status_code=404, detail="Cook session not found")
    return session

@app.post("/api/cook-sessions/{session_id}/skip-step", response_model=CookSession)
async def skip_cook_step(session_id: int):
    """Skip the current step (ingredient added without weighing or excluded)."""
    try:
        session = await db.confirm_cook_step(session_id, actual_qty=0.0, skip=True)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not session:
        raise HTTPException(status_code=404, detail="Cook session not found")
    return session

@app.post("/api/cook-sessions/{session_id}/complete")
async def complete_cook_session(session_id: int):
    """Finalize the session: deduct stock for every confirmed product step,
    mark the linked diet plan as consumed if any."""
    try:
        return await db.complete_cook_session(session_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

@app.post("/api/cook-sessions/{session_id}/cancel", status_code=204)
async def cancel_cook_session(session_id: int):
    success = await db.cancel_cook_session(session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Cook session not active or not found")
    return None

@app.get("/api/scales/{scale_id}/cook-step", response_model=CookStepView)
async def get_scale_cook_step(scale_id: int):
    """Polled by the kitchen ESP32 to know what to show on the OLED. Returns
    the active step on this scale, or status='idle' if none."""
    session = await db.get_active_cook_session_for_scale(scale_id)
    if not session:
        return CookStepView(status='idle')
    if session.current_step >= len(session.steps):
        # All steps confirmed/skipped but the session hasn't been completed yet
        recipe = await db.get_recipe(session.recipe_id)
        return CookStepView(
            status='completed',
            session_id=session.id,
            recipe_name=recipe.name if recipe else None,
            step_order=session.current_step,
            total_steps=len(session.steps),
        )
    step = session.steps[session.current_step]
    recipe = await db.get_recipe(session.recipe_id)
    name = step.custom_name
    if step.product_barcode and not name:
        prod = await db.get_product(step.product_barcode)
        name = prod.name if prod else step.product_barcode
    return CookStepView(
        status='active',
        session_id=session.id,
        recipe_name=recipe.name if recipe else None,
        step_order=step.step_order,
        total_steps=len(session.steps),
        ingredient_name=name,
        target_qty=step.target_qty,
        unit=step.unit,
        weighable=bool(step.weighable),
    )

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