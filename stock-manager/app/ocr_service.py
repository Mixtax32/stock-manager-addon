import cv2
import numpy as np
import easyocr
import logging
from io import BytesIO
from PIL import Image

logger = logging.getLogger(__name__)

# Initialize EasyOCR reader for Spanish
reader = None

def get_reader():
    """Lazy load EasyOCR reader"""
    global reader
    if reader is None:
        logger.info("Initializing EasyOCR reader for Spanish...")
        reader = easyocr.Reader(['es'], gpu=False)
    return reader

def preprocess_image(image_array: np.ndarray) -> np.ndarray:
    """
    Preprocess image for better OCR accuracy:
    - Denoise
    - Deskew
    - Enhance contrast
    - Convert to grayscale
    """
    # Convert BGR to grayscale if needed
    if len(image_array.shape) == 3:
        gray = cv2.cvtColor(image_array, cv2.COLOR_BGR2GRAY)
    else:
        gray = image_array

    # Denoise - remove small noise
    denoised = cv2.fastNlMeansDenoising(gray, h=10)

    # Deskew - correct rotation
    coords = np.column_stack(np.where(denoised > 0))
    angle = cv2.minAreaRect(cv2.convexHull(coords))[-1]
    if angle < -45:
        angle = 90 + angle
    if abs(angle) > 0.5:  # Only rotate if angle is significant
        h, w = denoised.shape
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        denoised = cv2.warpAffine(denoised, M, (w, h),
                                  borderMode=cv2.BORDER_REPLICATE)

    # Adaptive threshold - better than fixed threshold for varying lighting
    thresh = cv2.adaptiveThreshold(denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                    cv2.THRESH_BINARY, 11, 2)

    # Morphological operations - clean up the image
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
    cleaned = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
    cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_OPEN, kernel)

    # Upscale if image is too small (EasyOCR works better with larger images)
    h, w = cleaned.shape
    if w < 400 or h < 100:
        scale = max(400 / w, 100 / h)
        new_size = (int(w * scale), int(h * scale))
        cleaned = cv2.resize(cleaned, new_size, interpolation=cv2.INTER_CUBIC)

    return cleaned

def extract_text_from_image(image_bytes: bytes) -> str:
    """
    Extract text from image using EasyOCR with preprocessing
    """
    try:
        # Load image from bytes
        image = Image.open(BytesIO(image_bytes))
        image_array = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)

        # Preprocess
        logger.info("Preprocessing image...")
        processed = preprocess_image(image_array)

        # Extract text using EasyOCR
        logger.info("Running EasyOCR...")
        reader_instance = get_reader()
        results = reader_instance.readtext(processed, detail=0)

        # Join results with newlines
        text = '\n'.join(results)
        logger.info(f"Extracted {len(results)} lines of text")

        return text

    except Exception as e:
        logger.error(f"Error in OCR: {str(e)}", exc_info=True)
        raise

def parse_ticket_items(text: str) -> list:
    """
    Parse ticket text and extract product information
    """
    lines = text.split('\n')
    items = []

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Skip junk lines (same logic as frontend)
        if is_junk_line(line):
            continue

        items.append(line)

    return items

def is_junk_line(line: str) -> bool:
    """
    Determine if a line is junk (dates, totals, etc.)
    """
    trimmed = line.strip()
    norm = normalize_text(line)

    # Too short
    if len(norm) < 3:
        return True

    # Only numbers
    if norm.isdigit():
        return True

    # Barcodes (7+ consecutive digits)
    if len([c for c in trimmed if c.isdigit()]) >= 7:
        return True

    # Common junk patterns
    junk_patterns = [
        r'\btotal\b', r'\bsubtotal\b', r'\biva\b', r'\bbase\s*imp',
        r'\bcambio\b', r'\befectivo\b', r'\btarjeta\b', r'\bvisa\b',
        r'\bmastercard\b', r'\bnif\b', r'\bcif\b', r'\bgracias\b',
        r'\bticket\b', r'\bfactura\b', r'\brecibo\b',
    ]

    import re
    for pattern in junk_patterns:
        if re.search(pattern, line, re.IGNORECASE):
            return True

    return False

def normalize_text(text: str) -> str:
    """Normalize text for comparison"""
    import unicodedata
    return (text.lower()
            .replace('á', 'a').replace('é', 'e').replace('í', 'i')
            .replace('ó', 'o').replace('ú', 'u').replace('ñ', 'n'))
