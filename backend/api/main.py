
import os
from pathlib import Path
from tempfile import NamedTemporaryFile

from fastapi import FastAPI, File, UploadFile

from .database import get_or_create_plate, init_db
from license_plate_service.services.plate_service import process_image


app = FastAPI()


@app.on_event("startup")
def startup():
    init_db()


@app.post("/plates/recognize")
async def recognize_plate(image: UploadFile = File(...)):
    image_bytes = await image.read()
    temporary_file = NamedTemporaryFile(
        suffix=Path(image.filename or "").suffix, delete=False
    )

    try:
        temporary_file.write(image_bytes)
        temporary_file.close()
        result = process_image(temporary_file.name)

        if not result["success"]:
            return result

        plate = get_or_create_plate(result["plate"])
        return {**result, "saldo": plate["saldo"]}
    finally:
        if not temporary_file.file.closed:
            temporary_file.close()
        os.unlink(temporary_file.name)
