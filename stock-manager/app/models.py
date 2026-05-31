from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class Batch(BaseModel):
    id: int
    barcode: str
    quantity: float
    expiry_date: Optional[str] = None
    added_date: Optional[str] = None
    location: Optional[str] = None

class Product(BaseModel):
    barcode: str
    name: str
    category: str
    stock: float
    min_stock: float
    unit_type: str = "uds" # "uds", "g", "ml"
    location: Optional[str] = None
    expiry_date: Optional[str] = None
    image_url: Optional[str] = None
    weight_g: Optional[float] = None
    kcal_100g: Optional[float] = None
    proteins_100g: Optional[float] = None
    carbs_100g: Optional[float] = None
    fat_100g: Optional[float] = None
    serving_size: Optional[float] = None # Cantidad usual/paquete
    package_quantity: Optional[str] = None # Cantidad descriptiva de OFF (ej: "6 x 125g")
    tracking_mode: str = "manual"  # "manual" or "scale" (auto-tracked by load cell)
    batches: List[Batch] = []
    last_updated: Optional[datetime] = None

class ProductCreate(BaseModel):
    barcode: str
    name: str
    category: str
    min_stock: float = 2
    unit_type: str = "uds"
    location: Optional[str] = None
    image_url: Optional[str] = None
    weight_g: Optional[float] = None
    kcal_100g: Optional[float] = None
    proteins_100g: Optional[float] = None
    carbs_100g: Optional[float] = None
    fat_100g: Optional[float] = None
    serving_size: Optional[float] = None
    package_quantity: Optional[str] = None
    tracking_mode: str = "manual"

class StockUpdate(BaseModel):
    quantity: float
    expiry_date: Optional[str] = None
    reason: Optional[str] = None  # "consumed", "lost", etc.
    meal_type: Optional[str] = None
    location: Optional[str] = None

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    min_stock: Optional[float] = None
    unit_type: Optional[str] = None
    location: Optional[str] = None
    image_url: Optional[str] = None
    weight_g: Optional[float] = None
    kcal_100g: Optional[float] = None
    proteins_100g: Optional[float] = None
    carbs_100g: Optional[float] = None
    fat_100g: Optional[float] = None
    serving_size: Optional[float] = None
    package_quantity: Optional[str] = None
    tracking_mode: Optional[str] = None

class BatchUpdate(BaseModel):
    expiry_date: Optional[str] = None
    location: Optional[str] = None

class BatchStockUpdate(BaseModel):
    quantity: float

class MacroGoals(BaseModel):
    kcal: float = 2000
    proteins: float = 150
    carbs: float = 200
    fat: float = 70

class MacroGoalsUpdate(BaseModel):
    kcal: Optional[float] = None
    proteins: Optional[float] = None
    carbs: Optional[float] = None
    fat: Optional[float] = None

class Ingredient(BaseModel):
    id: Optional[int] = None
    recipe_id: Optional[int] = None
    product_barcode: Optional[str] = None
    custom_name: Optional[str] = None
    quantity: float
    unit: str

class Recipe(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    instructions: Optional[str] = None
    servings: int = 1
    time: Optional[int] = None
    tags: List[str] = []
    meal_types: List[str] = []
    output_product_id: Optional[str] = None
    output_qty: float = 0
    default_expiry_days: Optional[int] = None
    fridge_expiry_days: Optional[int] = None
    freezer_expiry_days: Optional[int] = None
    kcal: Optional[float] = None
    proteins: Optional[float] = None
    carbs: Optional[float] = None
    fat: Optional[float] = None
    image_url: Optional[str] = None
    ingredients: List[Ingredient] = []

class RecipeCreate(BaseModel):
    name: str
    description: Optional[str] = None
    instructions: Optional[str] = None
    servings: int = 1
    time: Optional[int] = None
    tags: List[str] = []
    meal_types: List[str] = []
    output_product_id: Optional[str] = None
    output_qty: float = 0
    default_expiry_days: Optional[int] = None
    fridge_expiry_days: Optional[int] = None
    freezer_expiry_days: Optional[int] = None
    kcal: Optional[float] = None
    proteins: Optional[float] = None
    carbs: Optional[float] = None
    fat: Optional[float] = None
    image_url: Optional[str] = None
    ingredients: List[dict] = []

class DietPlan(BaseModel):
    id: int
    date: str
    meal_type: str
    recipe_id: Optional[int] = None
    product_barcode: Optional[str] = None
    custom_name: Optional[str] = None
    quantity: float
    is_consumed: bool = False

class DietPlanCreate(BaseModel):
    date: str
    meal_type: str
    recipe_id: Optional[int] = None
    product_barcode: Optional[str] = None
    custom_name: Optional[str] = None
    quantity: float = 1.0

class MovementUpdate(BaseModel):
    quantity: float  # new absolute consumed quantity (positive); backend stores as negative quantity_change

class BodyWeight(BaseModel):
    date: str
    weight: float
    created_at: Optional[datetime] = None

class BodyWeightCreate(BaseModel):
    weight: float
    date: Optional[str] = None  # defaults to today server-side


# --- Smart Scale models (ESP32 + HX711 integration) -------------------------

class Scale(BaseModel):
    id: int
    name: str
    ha_entity_id: Optional[str] = None
    product_barcode: Optional[str] = None
    batch_id: Optional[int] = None
    tare_g: float = 0
    last_stable_weight_g: Optional[float] = None
    last_event_weight_g: Optional[float] = None
    last_event_at: Optional[datetime] = None
    calibration_factor: float = 1.0
    created_at: Optional[datetime] = None

class ScaleCreate(BaseModel):
    name: str
    ha_entity_id: Optional[str] = None
    product_barcode: Optional[str] = None
    tare_g: float = 0
    calibration_factor: float = 1.0

class ScaleUpdate(BaseModel):
    name: Optional[str] = None
    ha_entity_id: Optional[str] = None
    product_barcode: Optional[str] = None
    batch_id: Optional[int] = None
    tare_g: Optional[float] = None
    calibration_factor: Optional[float] = None

class ScaleWeight(BaseModel):
    """Stable weight reading pushed by the ESP32 — updates live stock display,
    does NOT create a movement entry."""
    weight_g: float

class ScaleEvent(BaseModel):
    """Semantic event triggered by a physical button on the scale."""
    type: str  # "tare" | "consumo" | "nuevo_lote"
    weight_g: float

class PendingRefill(BaseModel):
    id: int
    product_barcode: str
    qty_estimated: float
    source: str  # "barcode_scan" | "ticket_ocr" | "manual"
    source_meta: Optional[str] = None
    status: str = "pending"  # "pending" | "resolved" | "cancelled"
    created_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    resolved_batch_id: Optional[int] = None

class PendingRefillCreate(BaseModel):
    product_barcode: str
    qty_estimated: float
    source: str
    source_meta: Optional[str] = None

class PendingRefillResolve(BaseModel):
    """Manually resolve a pending refill with a concrete weight (when the user
    chose 'add now' instead of waiting for the NUEVO LOTE button)."""
    actual_qty: float

