import os

import psycopg


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:15432/smart_parking",
)
RECOGNIZED_PLATE_INITIAL_BALANCE = 100.0


class InsufficientBalanceError(ValueError):
    pass


def init_db():
    with psycopg.connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS placas (
                    numero_placa VARCHAR(10) PRIMARY KEY,
                    saldo DOUBLE PRECISION NOT NULL DEFAULT 0.0
                )
                """)

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS entradas (
                    id BIGSERIAL PRIMARY KEY,
                    numero_placa VARCHAR(10) NOT NULL,
                    data TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (numero_placa)
                        REFERENCES placas(numero_placa)
                )
                """
            )


def get_or_create_plate(plate_number):
    with psycopg.connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO placas (numero_placa, saldo)
                VALUES (%s, %s)
                ON CONFLICT (numero_placa) DO NOTHING
                RETURNING numero_placa, saldo
                """,
                (plate_number, RECOGNIZED_PLATE_INITIAL_BALANCE),
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


def create_plate(plate_number, balance):
    with psycopg.connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO placas (numero_placa, saldo)
                VALUES (%s, %s)
                ON CONFLICT (numero_placa) DO NOTHING
                RETURNING numero_placa, saldo
                """,
                (plate_number, balance),
            )
            plate = cursor.fetchone()

    if plate is None:
        return None

    return {"numero_placa": plate[0], "saldo": float(plate[1])}


def add_balance(plate_number, balance):
    with psycopg.connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE placas
                SET saldo = saldo + %s
                WHERE numero_placa = %s
                RETURNING numero_placa, saldo
                """,
                (balance, plate_number),
            )
            plate = cursor.fetchone()

    if plate is None:
        return None

    return {"numero_placa": plate[0], "saldo": float(plate[1])}


def register_entry(plate_number):
    with psycopg.connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT COUNT(*)
                FROM entradas
                WHERE numero_placa = %s
                """,
                (plate_number,),
            )
            previous_entries = cursor.fetchone()

            if previous_entries is None:
                raise RuntimeError(
                    "Não foi possível consultar as entradas da placa."
                )

            entry_type = (
                "entrada"
                if (previous_entries[0] + 1) % 2 == 1
                else "saida"
            )
            cursor.execute(
                """
                INSERT INTO entradas (numero_placa)
                VALUES (%s)
                """,
                (plate_number,),
            )

            if entry_type == "saida":
                charge_exit(plate_number, connection)

    return entry_type


def charge_exit(plate_number, connection=None):
    if connection is None:
        with psycopg.connect(DATABASE_URL) as new_connection:
            return charge_exit(plate_number, new_connection)

    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT id, data
            FROM entradas
            WHERE numero_placa = %s
            ORDER BY data DESC, id DESC
            LIMIT 2
            """,
            (plate_number,),
        )
        recent_entries = cursor.fetchall()

        if len(recent_entries) < 2:
            raise RuntimeError(
                "Não há registros suficientes para calcular a saída."
            )

        exit_time = recent_entries[0][1]
        entry_time = recent_entries[1][1]
        duration_hours = (
            exit_time - entry_time
        ).total_seconds() / 3600

        if duration_hours < 0:
            raise RuntimeError(
                "Os registros da placa estão em ordem de data inválida."
            )

        charged_hours = min(duration_hours, 3)
        extra_hours = max(duration_hours - 3, 0)
        amount = round(charged_hours * 3 + extra_hours, 2)

        cursor.execute(
            """
            UPDATE placas
            SET saldo = saldo - %s
            WHERE numero_placa = %s
              AND saldo >= %s
            RETURNING numero_placa, saldo
            """,
            (amount, plate_number, amount),
        )
        plate = cursor.fetchone()

    if plate is None:
        raise InsufficientBalanceError(
            "Saldo insuficiente para pagar a permanência da placa."
        )

    return {"numero_placa": plate[0], "saldo": float(plate[1])}


def count_entries(plate_number):
    with psycopg.connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT COUNT(*)
                FROM entradas
                WHERE numero_placa = %s
                """,
                (plate_number,),
            )
            result = cursor.fetchone()

    if result is None:
        raise RuntimeError("Não foi possível consultar as entradas da placa.")

    return int(result[0])