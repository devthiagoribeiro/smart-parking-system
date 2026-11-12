import os
from pathlib import Path
import re
import logging

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)

# Compatibility flags must be set before importing Paddle/PaddleOCR.
os.environ.setdefault("FLAGS_enable_pir_api", "0")
os.environ.setdefault("FLAGS_use_mkldnn", "0")

from paddleocr import PaddleOCR


PROJECT_ROOT = next(
    p for p in Path(__file__).resolve().parents if (p / ".git").exists()
)


def verify_valid_license_plate(results):
    """Verifies if any of the OCR results match the expected license plate formats
    and returns the valid plate and its index."""

    patterns = [
        re.compile(r"^[A-Z]{3}\d{4}$"),  # Old model: ABC1234
        re.compile(r"^[A-Z]{3}\d[A-Z]\d{2}$"),  # Mercosul: ABC1D23
    ]

    for result in results:
        if result is None:
            continue

        candidate = re.sub(r"[^A-Z0-9]", "", str(result).upper())

        for pattern in patterns:
            if pattern.fullmatch(candidate):
                return candidate

    return None


def resolve_image_path(image_path):
    """Resolves image paths from absolute or project-relative inputs."""

    candidate = Path(image_path)
    if candidate.is_absolute():
        return candidate

    return (PROJECT_ROOT / candidate).resolve()


def recognize_license_plate(image_path):
    """Recognizes the license plate text from the given image using PaddleOCR."""

    image_path = resolve_image_path(image_path)
    if not image_path.exists():
        raise FileNotFoundError(f"Image not found: {image_path}")

    try:
        ocr = PaddleOCR(use_textline_orientation=True, lang="en", enable_mkldnn=False)
    except TypeError:
        ocr = PaddleOCR(use_textline_orientation=True, lang="en")

    results = ocr.predict(str(image_path))
    logging.debug(f"OCR results: {results}")
    for result in results:
        if result is None or "rec_texts" not in result or "rec_scores" not in result:
            logging.warning(f"Unexpected OCR result format: {result}")
            continue

        logging.info(
            f"Detected text: {result['rec_texts']}, Scores: {result['rec_scores']}"
        )
        rec_texts = result["rec_texts"]

    plate = verify_valid_license_plate(rec_texts)
    if plate is None:
        return None

    return plate


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Recognize license plate from an image."
    )
    parser.add_argument("--image-path", type=str, help="Path to the image file.")
    args = parser.parse_args()

    try:
        plate = recognize_license_plate(args.image_path)
        if plate:
            print(f"Recognized License Plate: {plate}")
        else:
            print("No valid license plate detected.")
    except Exception as e:
        logging.error(f"Error during license plate recognition: {e}")
