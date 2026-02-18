import httpx
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)

OPENFOODFACTS_API = "https://world.openfoodfacts.org/api/v2/product/{barcode}.json"
HEADERS = {
    "User-Agent": "StockManager-HomeAssistant/1.0"
}


async def get_product_from_barcode(barcode: str) -> Dict[str, Any]:
    """
    Fetch product information from Open Food Facts API.

    Returns:
        A dict with 'found': true and product data if found, or 'found': false if not found.
        Product data includes: name, brand, category, image_url, quantity
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            url = OPENFOODFACTS_API.format(barcode=barcode)
            params = {
                "fields": "product_name,brands,categories,image_url,quantity"
            }

            response = await client.get(url, headers=HEADERS, params=params)
            response.raise_for_status()

            data = response.json()

            # Check if product was found (status 1 means found)
            if data.get("status") == 1:
                product_data = data.get("product", {})
                return {
                    "found": True,
                    "name": product_data.get("product_name", ""),
                    "brand": product_data.get("brands", ""),
                    "category": product_data.get("categories", ""),
                    "image_url": product_data.get("image_url", ""),
                    "quantity": product_data.get("quantity", "")
                }
            else:
                return {"found": False}

    except httpx.RequestError as e:
        logger.error(f"Request error fetching barcode {barcode}: {e}")
        return {"found": False}
    except Exception as e:
        logger.error(f"Error fetching product from Open Food Facts: {e}")
        return {"found": False}
