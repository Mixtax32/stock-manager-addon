import httpx
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)

OPENFOODFACTS_API = "https://world.openfoodfacts.org/api/v2/product/{barcode}.json"
OPENPRODUCTFACTS_API = "https://world.openproductfacts.org/api/v2/product/{barcode}.json"
BARCODE_LOOKUP_API = "https://api.barcodelookup.com/v3/products"

HEADERS = {
    "User-Agent": "StockManager-HomeAssistant/1.0"
}


async def _search_open_food_facts(barcode: str, client: httpx.AsyncClient) -> Dict[str, Any]:
    """Search in Open Food Facts (best for food products)"""
    try:
        url = OPENFOODFACTS_API.format(barcode=barcode)
        params = {"fields": "product_name,brands,categories,image_url,quantity"}

        response = await client.get(url, headers=HEADERS, params=params, timeout=5.0)
        response.raise_for_status()

        data = response.json()
        if data.get("status") == 1:
            product_data = data.get("product", {})
            return {
                "found": True,
                "name": product_data.get("product_name", ""),
                "brand": product_data.get("brands", ""),
                "category": product_data.get("categories", ""),
                "image_url": product_data.get("image_url", ""),
                "quantity": product_data.get("quantity", ""),
                "source": "Open Food Facts"
            }
    except Exception as e:
        logger.debug(f"Open Food Facts lookup failed for {barcode}: {e}")

    return {"found": False}


async def _search_open_product_facts(barcode: str, client: httpx.AsyncClient) -> Dict[str, Any]:
    """Search in Open Product Facts (for non-food products)"""
    try:
        url = OPENPRODUCTFACTS_API.format(barcode=barcode)
        params = {"fields": "product_name,brands,categories,image_url,quantity"}

        response = await client.get(url, headers=HEADERS, params=params, timeout=5.0)
        response.raise_for_status()

        data = response.json()
        if data.get("status") == 1:
            product_data = data.get("product", {})
            return {
                "found": True,
                "name": product_data.get("product_name", ""),
                "brand": product_data.get("brands", ""),
                "category": product_data.get("categories", ""),
                "image_url": product_data.get("image_url", ""),
                "quantity": product_data.get("quantity", ""),
                "source": "Open Product Facts"
            }
    except Exception as e:
        logger.debug(f"Open Product Facts lookup failed for {barcode}: {e}")

    return {"found": False}


async def _search_barcode_lookup(barcode: str, client: httpx.AsyncClient) -> Dict[str, Any]:
    """Search in Barcode Lookup API (free tier without key)"""
    try:
        params = {"barcode": barcode}

        response = await client.get(BARCODE_LOOKUP_API, params=params, timeout=5.0)
        response.raise_for_status()

        data = response.json()
        if data.get("products") and len(data["products"]) > 0:
            product = data["products"][0]
            return {
                "found": True,
                "name": product.get("title", "") or product.get("name", ""),
                "brand": product.get("brand", ""),
                "category": product.get("category", ""),
                "image_url": product.get("image", ""),
                "quantity": product.get("size", ""),
                "source": "Barcode Lookup"
            }
    except Exception as e:
        logger.debug(f"Barcode Lookup failed for {barcode}: {e}")

    return {"found": False}


async def get_product_from_barcode(barcode: str) -> Dict[str, Any]:
    """
    Fetch product information from multiple sources with fallback.

    Tries in order:
    1. Open Food Facts (best for food)
    2. Open Product Facts (for non-food products)
    3. Barcode Lookup (general database)

    Returns:
        A dict with 'found': true and product data if found, or 'found': false if not found.
        Product data includes: name, brand, category, image_url, quantity, source
    """
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Try Open Food Facts first (best for food products)
            result = await _search_open_food_facts(barcode, client)
            if result["found"]:
                return result

            # Try Open Product Facts (better for non-food items)
            result = await _search_open_product_facts(barcode, client)
            if result["found"]:
                return result

            # Try Barcode Lookup as last resort
            result = await _search_barcode_lookup(barcode, client)
            if result["found"]:
                return result

            return {"found": False}

    except httpx.RequestError as e:
        logger.error(f"Request error fetching barcode {barcode}: {e}")
        return {"found": False}
    except Exception as e:
        logger.error(f"Error fetching product information for barcode {barcode}: {e}")
        return {"found": False}
