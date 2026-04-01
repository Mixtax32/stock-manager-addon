from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class Batch(BaseModel):
    id: int
    barcode: str
    quantity: float
    expiry_date: Optional[str] = None
    added_date: Optional[str] = None

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

class StockUpdate(BaseModel):
    quantity: float
    expiry_date: Optional[str] = None
    reason: Optional[str] = None  # "consumed", "lost", etc.

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

class BatchUpdate(BaseModel):
    expiry_date: Optional[str] = None

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

