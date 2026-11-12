# License Plate Service

This service implements a full license-plate recognition pipeline in Python:

1. Detect plate region in a vehicle image (YOLO).
2. Crop plate region to generate an OCR-friendly image.
3. Run OCR and validate the plate format.

The current implementation is a pipeline module (not an HTTP API yet), designed to be imported by an API layer.

## Project Structure

- images/test_images/: input images used during development and local tests.
- images/cropped_images/: generated plate crops saved by the pipeline before OCR.
- models/vehicle_license_plate-yolo26s.pt: YOLO model used for detection and ROI extraction.
- services/detection.py: YOLO inference and ROI extraction.
- services/preprocess.py: image crop and persistence in cropped_images.
- services/recognition.py: OCR + plate text validation.
- services/plate_service.py: orchestration entry point for the full pipeline.

## Detection Model

- Architecture base: YOLO26s.
- Training data: approximately 2000 annotated license-plate images.
- Runtime output: one ROI (x1, y1, x2, y2) for the plate, with a small padding margin.

## How the Pipeline Works

### 1) Detection (services/detection.py)

- Loads the model from models/vehicle_license_plate-yolo26s.pt.
- Uses CUDA when available, otherwise CPU.
- Runs predict with conf=0.5 and returns the first detected bounding box as ROI.

### 2) Preprocessing (services/preprocess.py)

- Reads the full image with OpenCV.
- Crops the ROI.
- Computes SHA-256 hash from image bytes and saves the crop into images/cropped_images/<hash>.jpg.
- Returns the saved crop path.

### 3) Recognition (services/recognition.py)

- Resolves relative paths from project root.
- Fails early with FileNotFoundError if the crop file does not exist.
- Runs PaddleOCR and validates recognized text against Brazilian plate formats:
	- Old format: ABC1234
	- Mercosul format: ABC1D23
- Returns recognized plate text when valid, otherwise None.

### 4) Orchestration (services/plate_service.py)

- Executes detection -> preprocessing -> recognition.
- Returns:
	- success: bool
	- plate: string | None
	- processing_time_ms: float

## Setup

Run from the repository root.

1. Create virtual environment and activate:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```

## Local Usage

### Run the full pipeline

```bash
python backend/license-plate-service/services/plate_service.py --image-path <image_path>
```

### Run OCR only on an already cropped image

```bash
python backend/license-plate-service/services/recognition.py --image-path <cropped_image_path>
```

## Example Output

Typical response from the pipeline module:

```json
{
	"success": true,
	"plate": "ABC1D23",
	"processing_time_ms": 138.42
}
```

## Integration Notes for API Developers

- Import and call process_image(image_path) from services/plate_service.py in your API endpoint.
- Use absolute paths when possible to avoid path-resolution mistakes.
- Keep image uploads outside this folder, then pass the saved file path to process_image.
- Preserve images/cropped_images write permission, since OCR currently depends on the generated crop file.

