
import os
from pathlib import Path
from tempfile import NamedTemporaryFile

from fastapi import FastAPI, File, HTTPException, UploadFile

from .database import (
    add_balance,
    create_plate,
    get_or_create_plate,
    init_db,
    InsufficientBalanceError,
    register_entry,
)
from .schemas import BalanceAdd, PlateCreate
from license_plate_service.services.plate_service import process_image


app = FastAPI()


@app.on_event("startup")
def startup():
    init_db()


@app.post("/plates", status_code=201)
def create_plate_route(plate_data: PlateCreate):
    plate = create_plate(plate_data.numero_placa, plate_data.saldo)

    if plate is None:
        raise HTTPException(
            status_code=409,
            detail="A placa já está cadastrada.",
        )

    return plate


@app.post("/plates/{plate_number}/balance")
def add_balance_route(plate_number: str, balance_data: BalanceAdd):
    plate = add_balance(plate_number, balance_data.valor)

    if plate is None:
        raise HTTPException(
            status_code=404,
            detail="Placa não cadastrada.",
        )

    return plate


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
        entry_type = register_entry(plate["numero_placa"])
        if entry_type == "saida":
            plate = get_or_create_plate(plate["numero_placa"])
        return {**result, "saldo": plate["saldo"], "tipo": entry_type}
    except InsufficientBalanceError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    finally:
        if not temporary_file.file.closed:
            temporary_file.close()
        os.unlink(temporary_file.name)
