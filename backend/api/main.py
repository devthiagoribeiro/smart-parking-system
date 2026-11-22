import os
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Literal, Optional

from fastapi import FastAPI, File, Header, HTTPException, Query, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware

from .database import (
    add_balance,
    create_plate,
    get_or_create_plate,
    get_plate,
    init_db,
    InsufficientBalanceError,
    list_events,
    list_notifications,
    list_plates,
    list_spots,
    mark_notifications_read,
    NoOpenEntryError,
    plate_history,
    pricing,
    register_entry,
    today_stats,
    update_spot,
)
from .schemas import BalanceAdd, normalize_plate, PlateCreate, SpotUpdate
from license_plate_service.services.plate_service import process_image


EventType = Literal["entrada", "saida"]


def _device_list(name):
    return {
        item.strip()
        for item in os.getenv(name, "").split(",")
        if item.strip()
    }


# IDs (cabeçalho X-Device-Id) das câmeras dedicadas a cada sentido.
# Sem configuração, todas as câmeras alternam entrada/saída.
ENTRY_DEVICE_IDS = _device_list("ENTRY_DEVICE_IDS")
EXIT_DEVICE_IDS = _device_list("EXIT_DEVICE_IDS")

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if origin.strip()
]


app = FastAPI(title="Smart Parking API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    init_db()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/pricing")
def pricing_route():
    return pricing()


# --------------------------------------------------------------------------
# Placas, saldo e notificações
# --------------------------------------------------------------------------

@app.get("/plates")
def list_plates_route():
    return list_plates()


@app.post("/plates", status_code=201)
def create_plate_route(plate_data: PlateCreate):
    plate = create_plate(plate_data.numero_placa, plate_data.saldo)

    if plate is None:
        raise HTTPException(
            status_code=409,
            detail="A placa já está cadastrada.",
        )

    return plate


def _existing_plate(plate_number):
    plate = get_plate(normalize_plate(plate_number))
    if plate is None:
        raise HTTPException(status_code=404, detail="Placa não cadastrada.")
    return plate


@app.get("/plates/{plate_number}")
def get_plate_route(plate_number: str):
    return _existing_plate(plate_number)


@app.post("/plates/{plate_number}/balance")
def add_balance_route(plate_number: str, balance_data: BalanceAdd):
    plate = add_balance(
        normalize_plate(plate_number), balance_data.valor, balance_data.metodo
    )

    if plate is None:
        raise HTTPException(
            status_code=404,
            detail="Placa não cadastrada.",
        )

    return plate


@app.get("/plates/{plate_number}/history")
def plate_history_route(
    plate_number: str, limit: int = Query(50, ge=1, le=500)
):
    plate = _existing_plate(plate_number)
    return plate_history(plate["numero_placa"], limit)


@app.get("/plates/{plate_number}/notifications")
def notifications_route(
    plate_number: str, limit: int = Query(50, ge=1, le=500)
):
    plate = _existing_plate(plate_number)
    return list_notifications(plate["numero_placa"], limit)


@app.post("/plates/{plate_number}/notifications/read")
def mark_read_route(plate_number: str):
    plate = _existing_plate(plate_number)
    return {"marcadas": mark_notifications_read(plate["numero_placa"])}


# --------------------------------------------------------------------------
# Reconhecimento de placa (ESP32-CAM)
# --------------------------------------------------------------------------

def _resolve_type(explicit_type, device_id):
    if explicit_type:
        return explicit_type
    if device_id in ENTRY_DEVICE_IDS:
        return "entrada"
    if device_id in EXIT_DEVICE_IDS:
        return "saida"
    return None


def _recognize(image_path, forced_type, device_id):
    result = process_image(image_path)

    if not result["success"]:
        return result

    plate = get_or_create_plate(result["plate"])
    event = register_entry(
        plate["numero_placa"],
        forced_type=forced_type,
        device=device_id,
        ocr_time_ms=result.get("processing_time_ms"),
    )
    if event["tipo"] == "saida":
        plate = get_or_create_plate(plate["numero_placa"])

    return {
        **result,
        "saldo": plate["saldo"],
        "tipo": event["tipo"],
        "duplicada": event["duplicada"],
        "valor_cobrado": event.get("valor_cobrado"),
        "permanencia_min": event.get("permanencia_min"),
    }


@app.post("/plates/recognize")
async def recognize_plate(
    image: UploadFile = File(...),
    tipo: Optional[EventType] = Query(
        None,
        description="Força o sentido da leitura. Sem ele, o sentido alterna.",
    ),
    x_device_id: Optional[str] = Header(None),
):
    image_bytes = await image.read()
    temporary_file = NamedTemporaryFile(
        suffix=Path(image.filename or "").suffix, delete=False
    )

    try:
        temporary_file.write(image_bytes)
        temporary_file.close()
        # O OCR é pesado: roda fora do event loop para não travar o painel.
        return await run_in_threadpool(
            _recognize,
            temporary_file.name,
            _resolve_type(tipo, x_device_id),
            x_device_id,
        )
    except InsufficientBalanceError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except NoOpenEntryError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    finally:
        if not temporary_file.file.closed:
            temporary_file.close()
        os.unlink(temporary_file.name)


# --------------------------------------------------------------------------
# Painel do operador
# --------------------------------------------------------------------------

@app.get("/events")
def events_route(
    limit: int = Query(50, ge=1, le=500),
    tipo: Optional[Literal["entrada", "saida", "recusada"]] = None,
):
    return list_events(limit, tipo)


@app.get("/stats/today")
def stats_route():
    return today_stats()


@app.get("/spots")
def spots_route():
    return list_spots()


@app.put("/spots/{spot_id}")
def update_spot_route(spot_id: int, spot_data: SpotUpdate):
    spot = update_spot(spot_id, spot_data.ocupada, spot_data.campo_gauss)
    if spot is None:
        raise HTTPException(status_code=404, detail="Vaga não encontrada.")
    return spot
