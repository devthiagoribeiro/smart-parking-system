import cv2
import hashlib
from pathlib import Path

PROJECT_ROOT = next(
    p for p in Path(__file__).resolve().parents if (p / ".git").exists()
)


def preprocess_license_plate(image_path, roi):
    """Preprocesses the license plate image by cropping it to
    the specified ROI and saving it using a hash of the image as the filename."""

    image = cv2.imread(image_path)

    x1, y1, x2, y2 = roi

    cropped_img = image[y1:y2, x1:x2]
    cropped_img_path = (
        PROJECT_ROOT
        / "backend"
        / f"license-plate-service/images/cropped_images/{hash_image(image)}.jpg"
    )
    cv2.imwrite(str(cropped_img_path), cropped_img)

    return cropped_img_path


def hash_image(image):
    """Generates a SHA-256 hash for the given image."""

    img_bytes = cv2.imencode(".jpg", image)[1].tobytes()

    img_hash = hashlib.sha256(img_bytes).hexdigest()

    return img_hash


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Preprocess a license plate image by cropping it to the specified ROI."
    )
    parser.add_argument("--image-path", type=str, help="Path to the input image.")
    parser.add_argument(
        "--roi",
        type=int,
        nargs=4,
        help="Region of interest (ROI) as four integers: x1 y1 x2 y2.",
    )

    args = parser.parse_args()

    print(
        f"Preprocessed image saved at: {preprocess_license_plate(args.image_path, args.roi)}"
    )
