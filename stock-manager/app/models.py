from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class Batch(BaseModel):
    id: int
    barcode: str
    quantity: int
    expiry_date: Optional[str] = None
    added_date: Optional[str] = None

class Product(BaseModel):
    barcode: str
    name: str
    category: str
    stock: int
    min_stock: int
    location: Optional[str] = None
    expiry_date: Optional[str] = None
    batches: List[Batch] = []
    last_updated: Optional[datetime] = None

class ProductCreate(BaseModel):
    barcode: str
    name: str
    category: str
    min_stock: int = 2
    location: Optional[str] = None

class StockUpdate(BaseModel):
    quantity: int
    expiry_date: Optional[str] = None

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    min_stock: Optional[int] = None
    location: Optional[str] = None

class BatchUpdate(BaseModel):
    expiry_date: Optional[str] = None

class BatchStockUpdate(BaseModel):
    quantity: int
