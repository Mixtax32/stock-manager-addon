import httpx
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)


def map_external_category_to_internal(external_category: str) -> str:
    """
    Maps external API categories to internal system categories.

    Internal categories: Alimentos, Bebidas, Limpieza, Higiene, Otros

    Args:
        external_category: Category from Open Food/Beauty/Product Facts

    Returns:
        Internal category or 'Otros' if no match found
    """
    if not external_category:
        return "Otros"

    category_lower = external_category.lower()

    # Mapping rules (order matters - more specific first)
    mappings = {
        "Higiene": ["higiene", "cosméticos", "cosmetic", "beauty", "personal care", "skincare", "hair", "body care", "belleza"],
        "Bebidas": ["bebida", "drink", "beverage", "juice", "water", "soda", "café", "coffee", "tea", "té"],
        "Limpieza": ["limpieza", "cleaning", "detergent", "soap", "hygiene", "disinfectant"],
        "Alimentos": ["alimento", "food", "comida", "snack", "candy", "chocolate", "cereal", "pan", "bread", "pet food", "perro", "gato", "dog", "cat", "mascotas"],
    }

    # Try to find a match
    for internal_category, keywords in mappings.items():
        for keyword in keywords:
            if keyword in category_lower:
                logger.info(f"Category mapping: '{external_category}' -> '{internal_category}' (matched: '{keyword}')")
                return internal_category

    # No match found - return 'Otros'
    logger.info(f"Category mapping: '{external_category}' -> 'Otros' (no match)")
    return "Otros"


OPENFOODFACTS_API = "https://world.openfoodfacts.org/api/v2/product/{barcode}.json"
OPENBEAUTYFACTS_API = "https://world.openbeautyfacts.org/api/v2/product/{barcode}.json"
OPENPRODUCTFACTS_API = "https://world.openproductfacts.org/api/v2/product/{barcode}.json"
OPENPETFOODFACTS_API = "https://world.openpetfoodfacts.org/api/v2/product/{barcode}.json"

HEADERS = {
    "User-Agent": "StockManager-HomeAssistant/1.0"
}


async def _search_facts_api(barcode: str, client: httpx.AsyncClient, api_url: str, source_name: str) -> Dict[str, Any]:
    """Generic function to search in any Open Facts API"""
    try:
        url = api_url.format(barcode=barcode)
        params = {"fields": "product_name,brands,categories,image_url,quantity,product_quantity,nutriments"}

        logger.info(f"Searching {source_name} for {barcode}...")
        response = await client.get(url, headers=HEADERS, params=params, timeout=5.0)

        if response.status_code == 404:
            logger.info(f"{source_name}: product not found (404) for {barcode}")
            return {"found": False}

        response.raise_for_status()
        data = response.json()

        if data.get("status") == 1:
            product_data = data.get("product", {})
            logger.info(f"{source_name} product data: {product_data}")

            external_category = product_data.get("categories", "")
            mapped_category = map_external_category_to_internal(external_category)

            nutriments = product_data.get("nutriments", {})

            return {
                "found": True,
                "name": product_data.get("product_name", ""),
                "brand": product_data.get("brands", ""),
                "category": mapped_category,
                "image_url": product_data.get("image_url", ""),
                "quantity": product_data.get("quantity", ""),
                "weight_g": product_data.get("product_quantity"),
                "kcal_100g": nutriments.get("energy-kcal_100g"),
                "proteins_100g": nutriments.get("proteins_100g"),
                "carbs_100g": nutriments.get("carbohydrates_100g"),
                "fat_100g": nutriments.get("fat_100g"),
                "source": source_name
            }
        else:
            logger.info(f"{source_name} status is not 1 for {barcode}: {data.get('status')}")
    except Exception as e:
        logger.debug(f"{source_name} lookup failed for {barcode}: {e}")

    return {"found": False}


async def get_product_from_barcode(barcode: str) -> Dict[str, Any]:
    """
    Fetch product information from multiple sources with fallback.
    """
    sources = [
        (OPENFOODFACTS_API, "Open Food Facts"),
        (OPENBEAUTYFACTS_API, "Open Beauty Facts"),
        (OPENPETFOODFACTS_API, "Open Pet Food Facts"),
        (OPENPRODUCTFACTS_API, "Open Product Facts")
    ]

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            for api_url, source_name in sources:
                result = await _search_facts_api(barcode, client, api_url, source_name)
                if result["found"]:
                    return result

            return {"found": False}

    except httpx.RequestError as e:
        logger.error(f"Request error fetching barcode {barcode}: {e}")
        return {"found": False}
    except Exception as e:
        logger.error(f"Error fetching product information for barcode {barcode}: {e}")
        return {"found": False}

