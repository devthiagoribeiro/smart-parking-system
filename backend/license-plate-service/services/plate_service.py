import logging
import time
from detection import detect_license_plate
from preprocess import preprocess_license_plate
from recognition import recognize_license_plate


def process_image(image):
    """Processes the given image to detect, preprocess, and recognize the license plate."""

    start_time = time.perf_counter()

    plate_roi = detect_license_plate(image)
    if plate_roi is None:
        return {"success": False, "plate": None, "processing_time_ms": 0}

    preprocessed_image_path = preprocess_license_plate(image, plate_roi)

    result = recognize_license_plate(preprocessed_image_path)
    if result is None:
        return {"success": False, "plate": None, "processing_time_ms": 0}

    logging.info(f"Final results: {result}")
    processing_time = (time.perf_counter() - start_time) * 1000

    return {
        "success": len(result) > 0,
        "plate": result,
        "processing_time_ms": round(processing_time, 2),
    }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Process an image to detect and recognize a license plate."
    )
    parser.add_argument("--image-path", type=str, help="Path to the input image.")
    args = parser.parse_args()

    try:
        result = process_image(args.image_path)
        if result["success"]:
            print(f"Recognized License Plate: {result['plate']}")
            print(f"Processing Time: {result['processing_time_ms']} ms")
        else:
            print("No valid license plate detected.")
    except Exception as e:
        logging.error(f"Error during image processing: {e}")
