import re
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


PLATE_PATTERN = re.compile(r"^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$")


def normalize_plate(value: str) -> str:
    """Uppercases and strips separators: 'abc-1d23' -> 'ABC1D23'."""
    return re.sub(r"[^A-Z0-9]", "", value.upper())


class PlateCreate(BaseModel):
    numero_placa: str = Field(min_length=1, max_length=10)
    saldo: float = Field(default=0, ge=0)

    @field_validator("numero_placa")
    @classmethod
    def validate_plate(cls, value: str) -> str:
        plate = normalize_plate(value)
        if not PLATE_PATTERN.match(plate):
            raise ValueError(
                "Placa inválida. Use o formato ABC1234 ou ABC1D23."
            )
        return plate


class BalanceAdd(BaseModel):
    valor: float = Field(gt=0, le=10000)
    metodo: Literal["pix", "cartao", "manual"] = "manual"


class SpotUpdate(BaseModel):
    ocupada: bool
    campo_gauss: Optional[float] = Field(
        default=None,
        description="|Δ campo| medido pelo magnetômetro, em Gauss (opcional).",
    )
