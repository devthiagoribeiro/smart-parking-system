from ultralytics import YOLO
from pathlib import Path
from torch import cuda


PROJECT_ROOT = next(
    p for p in Path(__file__).resolve().parents if (p / ".git").exists()
)
MODEL_PATH = (
    PROJECT_ROOT
    / "backend"
    / "license-plate-service"
    / "models"
    / "vehicle_license_plate-yolo26s.pt"
)
DEVICE = 0 if cuda.is_available() else "cpu"

model = YOLO(MODEL_PATH)


def detect_license_plate(full_plate_image):
    """Detects the license plate in the given image using a YOLO model and returns the ROI coordinates."""

    results = model.predict(source=full_plate_image, conf=0.5, device=DEVICE)

    box = results[0].boxes.xyxy[0]
    roi = (int(box[0]) - 3, int(box[1]) - 3, int(box[2]) + 3, int(box[3]) + 3)

    return roi


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Detect license plate in an image.")
    parser.add_argument("--image-path", type=str, help="Path to the input image.")
    args = parser.parse_args()

    roi = detect_license_plate(args.image_path)
    print(f"Detected ROI: {roi}")
