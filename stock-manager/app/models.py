from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class Product(BaseModel):
    barcode: str
    name: str
    category: str
    stock: int
    min_stock: int
    expiry_date: Optional[str] = None
    last_updated: Optional[datetime] = None

class ProductCreate(BaseModel):
    barcode: str
    name: str
    category: str
    min_stock: int = 2
    expiry_date: Optional[str] = None

class StockUpdate(BaseModel):
    quantity: int  # Positive to add, negative to remove

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    min_stock: Optional[int] = None
    expiry_date: Optional[str] = None