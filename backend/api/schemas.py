from pydantic import BaseModel, Field


class PlateCreate(BaseModel):
    numero_placa: str = Field(min_length=1, max_length=10)
    saldo: float = Field(ge=0)


class BalanceAdd(BaseModel):
    valor: float = Field(gt=0)