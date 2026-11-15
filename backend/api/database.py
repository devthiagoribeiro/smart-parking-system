import os

import psycopg


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:15432/smart_parking",
)


def init_db():
    with psycopg.connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS placas (
                    numero_placa VARCHAR(10) PRIMARY KEY,
                    saldo DOUBLE PRECISION NOT NULL DEFAULT 0.0
                )
                """
            )


def get_or_create_plate(plate_number):
    with psycopg.connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO placas (numero_placa)
                VALUES (%s)
                ON CONFLICT (numero_placa) DO NOTHING
                RETURNING numero_placa, saldo
                """,
                (plate_number,),
            )
            plate = cursor.fetchone()

            if plate is None:
                cursor.execute(
                    """
                    SELECT numero_placa, saldo
                    FROM placas
                    WHERE numero_placa = %s
                    """,
                    (plate_number,),
                )
                plate = cursor.fetchone()

    if plate is None:
        raise RuntimeError("Não foi possível consultar a placa cadastrada.")

    return {"numero_placa": plate[0], "saldo": float(plate[1])}