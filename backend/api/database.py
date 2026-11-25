import os

import psycopg
from psycopg.rows import dict_row


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:15432/smart_parking",
)

# Saldo de uma placa reconhecida pela câmera que ainda não foi cadastrada.
# O cliente escolhe se quer recarregar ao se cadastrar pelo app.
RECOGNIZED_PLATE_INITIAL_BALANCE = float(
    os.getenv("RECOGNIZED_PLATE_INITIAL_BALANCE", "0")
)
# Quantidade de vagas monitoradas pelo firmware (hardware/main/main.c).
SPOT_COUNT = int(os.getenv("SPOT_COUNT", "2"))
# Abaixo desse saldo o cliente recebe a notificação de saldo baixo.
LOW_BALANCE_THRESHOLD = float(os.getenv("LOW_BALANCE_THRESHOLD", "10"))
# Uma leitura da mesma placa dentro dessa janela é tratada como repetida.
DUPLICATE_READ_SECONDS = float(os.getenv("DUPLICATE_READ_SECONDS", "5"))
# Fuso usado para agrupar as estatísticas do dia.
APP_TIMEZONE = os.getenv("APP_TIMEZONE", "America/Sao_Paulo")

FIRST_HOURS = 3
FIRST_HOURS_RATE = 3.0
EXTRA_HOUR_RATE = 1.0

# Converte uma coluna TIMESTAMP (gravada no fuso da sessão) em TIMESTAMPTZ,
# para que a API devolva datas com fuso explícito.
AWARE = "({col} AT TIME ZONE current_setting('TimeZone'))"
# Mesma coluna, no horário local do estacionamento.
LOCAL = "(({col} AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE %(tz)s)"


class InsufficientBalanceError(ValueError):
    pass


class NoOpenEntryError(ValueError):
    pass


def connect():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def calculate_fee(duration_hours):
    """R$ 3,00/h nas 3 primeiras horas e R$ 1,00/h depois (proporcional)."""
    charged_hours = min(duration_hours, FIRST_HOURS)
    extra_hours = max(duration_hours - FIRST_HOURS, 0)
    return round(
        charged_hours * FIRST_HOURS_RATE + extra_hours * EXTRA_HOUR_RATE, 2
    )


def pricing():
    return {
        "primeiras_horas": FIRST_HOURS,
        "valor_hora": FIRST_HOURS_RATE,
        "valor_hora_extra": EXTRA_HOUR_RATE,
    }


def init_db():
    with connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS placas (
                    numero_placa VARCHAR(10) PRIMARY KEY,
                    saldo DOUBLE PRECISION NOT NULL DEFAULT 0.0
                )
                """
            )
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
            # Colunas novas: o tipo do evento passa a ser gravado em vez de
            # deduzido pela paridade, e a saída guarda o valor cobrado.
            for column in (
                "tipo VARCHAR(10)",
                "valor DOUBLE PRECISION",
                "permanencia_min DOUBLE PRECISION",
                "dispositivo VARCHAR(64)",
                "tempo_ocr_ms DOUBLE PRECISION",
            ):
                cursor.execute(
                    f"ALTER TABLE entradas ADD COLUMN IF NOT EXISTS {column}"
                )
            # Registros antigos (sem tipo) seguem a regra de paridade original.
            cursor.execute(
                """
                WITH ordenadas AS (
                    SELECT id,
                           ROW_NUMBER() OVER (
                               PARTITION BY numero_placa ORDER BY data, id
                           ) AS n
                    FROM entradas
                    WHERE tipo IS NULL
                )
                UPDATE entradas e
                SET tipo = CASE WHEN o.n % 2 = 1 THEN 'entrada' ELSE 'saida' END
                FROM ordenadas o
                WHERE e.id = o.id
                """
            )
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS entradas_placa_data_idx
                ON entradas (numero_placa, data DESC, id DESC)
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS recargas (
                    id BIGSERIAL PRIMARY KEY,
                    numero_placa VARCHAR(10) NOT NULL
                        REFERENCES placas(numero_placa),
                    valor DOUBLE PRECISION NOT NULL,
                    metodo VARCHAR(20) NOT NULL,
                    data TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS notificacoes (
                    id BIGSERIAL PRIMARY KEY,
                    numero_placa VARCHAR(10) NOT NULL
                        REFERENCES placas(numero_placa),
                    tipo VARCHAR(30) NOT NULL,
                    titulo VARCHAR(120) NOT NULL,
                    mensagem TEXT NOT NULL,
                    lida BOOLEAN NOT NULL DEFAULT FALSE,
                    data TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS vagas (
                    id INTEGER PRIMARY KEY,
                    ocupada BOOLEAN NOT NULL DEFAULT FALSE,
                    campo_gauss DOUBLE PRECISION,
                    atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    ultima_leitura_em TIMESTAMP
                )
                """
            )
            cursor.execute(
                """
                INSERT INTO vagas (id)
                SELECT generate_series(1, %s)
                ON CONFLICT (id) DO NOTHING
                """,
                (SPOT_COUNT,),
            )


def _money(value):
    return f"R$ {value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _duration(minutes):
    minutes = int(round(minutes))
    hours, rest = divmod(minutes, 60)
    return f"{hours}h {rest:02d}min" if hours else f"{rest}min"


def _notify(cursor, plate_number, kind, title, message):
    cursor.execute(
        """
        INSERT INTO notificacoes (numero_placa, tipo, titulo, mensagem)
        VALUES (%s, %s, %s, %s)
        """,
        (plate_number, kind, title, message),
    )


def _notify_low_balance(cursor, plate_number, balance):
    if balance < LOW_BALANCE_THRESHOLD:
        _notify(
            cursor,
            plate_number,
            "saldo_baixo",
            "Saldo baixo",
            f"Seu saldo é de {_money(balance)}. Recarregue para não ter "
            "a saída recusada.",
        )


# --------------------------------------------------------------------------
# Placas e saldo
# --------------------------------------------------------------------------

def get_or_create_plate(plate_number):
    with connect() as connection:
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
                    "SELECT numero_placa, saldo FROM placas WHERE numero_placa = %s",
                    (plate_number,),
                )
                plate = cursor.fetchone()

    if plate is None:
        raise RuntimeError("Não foi possível consultar a placa cadastrada.")

    return {"numero_placa": plate["numero_placa"], "saldo": float(plate["saldo"])}


def create_plate(plate_number, balance):
    with connect() as connection:
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

            if balance > 0:
                cursor.execute(
                    """
                    INSERT INTO recargas (numero_placa, valor, metodo)
                    VALUES (%s, %s, 'manual')
                    """,
                    (plate_number, balance),
                )

    return {"numero_placa": plate["numero_placa"], "saldo": float(plate["saldo"])}


def add_balance(plate_number, balance, method="manual"):
    with connect() as connection:
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

            cursor.execute(
                """
                INSERT INTO recargas (numero_placa, valor, metodo)
                VALUES (%s, %s, %s)
                """,
                (plate_number, balance, method),
            )
            method_label = {"pix": "Pix", "cartao": "cartão"}.get(method)
            via = f" via {method_label} (simulado)" if method_label else ""
            _notify(
                cursor,
                plate_number,
                "recarga",
                "Recarga confirmada",
                f"{_money(balance)} adicionados{via}. "
                f"Novo saldo: {_money(float(plate['saldo']))}.",
            )

    return {"numero_placa": plate["numero_placa"], "saldo": float(plate["saldo"])}


def get_plate(plate_number):
    with connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT p.numero_placa,
                       p.saldo,
                       ultimo.tipo AS ultimo_tipo,
                       {AWARE.format(col="ultimo.data")} AS ultimo_em,
                       (
                           SELECT COUNT(*) FROM notificacoes n
                           WHERE n.numero_placa = p.numero_placa AND NOT n.lida
                       ) AS nao_lidas
                FROM placas p
                LEFT JOIN LATERAL (
                    SELECT tipo, data FROM entradas e
                    WHERE e.numero_placa = p.numero_placa
                      AND e.tipo IN ('entrada', 'saida')
                    ORDER BY data DESC, id DESC
                    LIMIT 1
                ) ultimo ON TRUE
                WHERE p.numero_placa = %s
                """,
                (plate_number,),
            )
            row = cursor.fetchone()

    if row is None:
        return None

    inside = row["ultimo_tipo"] == "entrada"
    return {
        "numero_placa": row["numero_placa"],
        "saldo": float(row["saldo"]),
        "no_patio": inside,
        "entrada_em": row["ultimo_em"] if inside else None,
        "notificacoes_nao_lidas": int(row["nao_lidas"]),
    }


def list_plates():
    with connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT p.numero_placa,
                       p.saldo,
                       ultimo.tipo AS ultimo_tipo,
                       {AWARE.format(col="ultimo.data")} AS ultimo_em
                FROM placas p
                LEFT JOIN LATERAL (
                    SELECT tipo, data FROM entradas e
                    WHERE e.numero_placa = p.numero_placa
                      AND e.tipo IN ('entrada', 'saida')
                    ORDER BY data DESC, id DESC
                    LIMIT 1
                ) ultimo ON TRUE
                ORDER BY ultimo.data DESC NULLS LAST, p.numero_placa
                """
            )
            rows = cursor.fetchall()

    return [
        {
            "numero_placa": row["numero_placa"],
            "saldo": float(row["saldo"]),
            "no_patio": row["ultimo_tipo"] == "entrada",
            "ultima_movimentacao": row["ultimo_em"],
        }
        for row in rows
    ]


def plate_history(plate_number, limit=50):
    with connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT * FROM (
                    SELECT 'mov-' || id AS id, tipo,
                           {AWARE.format(col="data")} AS data,
                           valor, permanencia_min, NULL AS metodo
                    FROM entradas
                    WHERE numero_placa = %(placa)s
                    UNION ALL
                    SELECT 'rec-' || id, 'recarga',
                           {AWARE.format(col="data")},
                           valor, NULL, metodo
                    FROM recargas
                    WHERE numero_placa = %(placa)s
                ) historico
                ORDER BY data DESC
                LIMIT %(limit)s
                """,
                {"placa": plate_number, "limit": limit},
            )
            return cursor.fetchall()


def list_notifications(plate_number, limit=50):
    with connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT id, tipo, titulo, mensagem, lida,
                       {AWARE.format(col="data")} AS data
                FROM notificacoes
                WHERE numero_placa = %s
                ORDER BY data DESC, id DESC
                LIMIT %s
                """,
                (plate_number, limit),
            )
            return cursor.fetchall()


def mark_notifications_read(plate_number):
    with connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE notificacoes SET lida = TRUE
                WHERE numero_placa = %s AND NOT lida
                """,
                (plate_number,),
            )
            return cursor.rowcount


# --------------------------------------------------------------------------
# Entrada e saída
# --------------------------------------------------------------------------

def register_entry(
    plate_number, forced_type=None, device=None, ocr_time_ms=None
):
    """Registra a leitura de uma placa e cobra na saída.

    Sem ``forced_type`` o tipo alterna: se a placa está no pátio é saída,
    senão é entrada. Leituras repetidas dentro de DUPLICATE_READ_SECONDS
    não geram um novo evento.
    """
    refused = None

    with connect() as connection:
        with connection.cursor() as cursor:
            # Serializa leituras simultâneas da mesma placa.
            cursor.execute(
                "SELECT pg_advisory_xact_lock(hashtext(%s))", (plate_number,)
            )
            cursor.execute(
                """
                SELECT id, tipo, data,
                       EXTRACT(EPOCH FROM (LOCALTIMESTAMP - data)) AS idade_s
                FROM entradas
                WHERE numero_placa = %s AND tipo IN ('entrada', 'saida')
                ORDER BY data DESC, id DESC
                LIMIT 1
                """,
                (plate_number,),
            )
            last = cursor.fetchone()
            inside = last is not None and last["tipo"] == "entrada"
            entry_type = forced_type or ("saida" if inside else "entrada")

            recent = (
                last is not None
                and float(last["idade_s"]) < DUPLICATE_READ_SECONDS
            )
            if recent and (forced_type is None or forced_type == last["tipo"]):
                return {"tipo": last["tipo"], "duplicada": True}

            if entry_type == "entrada" and inside:
                # Câmera de entrada leu de novo um carro que já está no pátio.
                return {"tipo": "entrada", "duplicada": True}

            if entry_type == "saida" and not inside:
                raise NoOpenEntryError(
                    "Não há entrada registrada para esta placa."
                )

            if entry_type == "entrada":
                cursor.execute(
                    """
                    INSERT INTO entradas
                        (numero_placa, tipo, dispositivo, tempo_ocr_ms)
                    VALUES (%s, 'entrada', %s, %s)
                    """,
                    (plate_number, device, ocr_time_ms),
                )
                _notify(
                    cursor,
                    plate_number,
                    "entrada",
                    "Entrada registrada",
                    f"Placa {plate_number} lida na portaria. A cobrança será "
                    "feita automaticamente na saída.",
                )
                return {"tipo": "entrada", "duplicada": False}

            minutes = max(float(last["idade_s"]) / 60, 0.0)
            amount = calculate_fee(minutes / 60)

            cursor.execute(
                """
                UPDATE placas
                SET saldo = saldo - %s
                WHERE numero_placa = %s AND saldo >= %s
                RETURNING saldo
                """,
                (amount, plate_number, amount),
            )
            plate = cursor.fetchone()

            if plate is None:
                # Saída negada: registra a tentativa para o painel e avisa o
                # cliente. O carro continua no pátio.
                cursor.execute(
                    """
                    INSERT INTO entradas
                        (numero_placa, tipo, valor, permanencia_min,
                         dispositivo, tempo_ocr_ms)
                    VALUES (%s, 'recusada', %s, %s, %s, %s)
                    """,
                    (plate_number, amount, minutes, device, ocr_time_ms),
                )
                _notify(
                    cursor,
                    plate_number,
                    "saida_recusada",
                    "Saída recusada",
                    f"Saldo insuficiente para {_money(amount)}. Adicione saldo "
                    "para liberar a cancela.",
                )
                refused = amount
            else:
                balance = float(plate["saldo"])
                cursor.execute(
                    """
                    INSERT INTO entradas
                        (numero_placa, tipo, valor, permanencia_min,
                         dispositivo, tempo_ocr_ms)
                    VALUES (%s, 'saida', %s, %s, %s, %s)
                    """,
                    (plate_number, amount, minutes, device, ocr_time_ms),
                )
                _notify(
                    cursor,
                    plate_number,
                    "saida",
                    f"Saída · {_money(amount)} debitado",
                    f"Permanência de {_duration(minutes)}. "
                    f"Saldo restante: {_money(balance)}.",
                )
                _notify_low_balance(cursor, plate_number, balance)

    # Fora do bloco para que a recusa seja gravada antes do erro.
    if refused is not None:
        raise InsufficientBalanceError(
            "Saldo insuficiente para pagar a permanência da placa."
        )

    return {
        "tipo": "saida",
        "duplicada": False,
        "valor_cobrado": amount,
        "permanencia_min": round(minutes, 1),
    }


def count_entries(plate_number):
    with connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT COUNT(*) AS total
                FROM entradas
                WHERE numero_placa = %s AND tipo IN ('entrada', 'saida')
                """,
                (plate_number,),
            )
            result = cursor.fetchone()

    if result is None:
        raise RuntimeError("Não foi possível consultar as entradas da placa.")

    return int(result["total"])


def list_events(limit=50, event_type=None):
    with connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT id, numero_placa, tipo,
                       {AWARE.format(col="data")} AS data,
                       valor, permanencia_min, dispositivo, tempo_ocr_ms
                FROM entradas
                WHERE %(tipo)s::text IS NULL OR tipo = %(tipo)s
                ORDER BY data DESC, id DESC
                LIMIT %(limit)s
                """,
                {"tipo": event_type, "limit": limit},
            )
            return cursor.fetchall()


# --------------------------------------------------------------------------
# Vagas
# --------------------------------------------------------------------------

def _spot_row(row):
    return {
        "id": row["id"],
        "ocupada": row["ocupada"],
        "campo_gauss": row["campo_gauss"],
        "atualizado_em": row["atualizado_em"],
        "ultima_leitura_em": row["ultima_leitura_em"],
    }


SPOT_COLUMNS = f"""
    id, ocupada, campo_gauss,
    {AWARE.format(col="atualizado_em")} AS atualizado_em,
    {AWARE.format(col="ultima_leitura_em")} AS ultima_leitura_em
"""


def list_spots():
    with connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(f"SELECT {SPOT_COLUMNS} FROM vagas ORDER BY id")
            return [_spot_row(row) for row in cursor.fetchall()]


def update_spot(spot_id, occupied, field_gauss=None):
    """Atualiza o estado de uma vaga.

    ``atualizado_em`` só muda quando o estado muda, para o painel mostrar
    há quanto tempo a vaga está livre/ocupada. ``ultima_leitura_em`` muda a
    cada chamada e indica se o sensor está se comunicando.
    """
    with connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                UPDATE vagas
                SET atualizado_em = CASE
                        WHEN ocupada IS DISTINCT FROM %(ocupada)s
                        THEN LOCALTIMESTAMP ELSE atualizado_em END,
                    ocupada = %(ocupada)s,
                    campo_gauss = %(campo)s,
                    ultima_leitura_em = LOCALTIMESTAMP
                WHERE id = %(id)s
                RETURNING {SPOT_COLUMNS}
                """,
                {"id": spot_id, "ocupada": occupied, "campo": field_gauss},
            )
            row = cursor.fetchone()

    return _spot_row(row) if row else None


# --------------------------------------------------------------------------
# Estatísticas do dia
# --------------------------------------------------------------------------

def today_stats():
    params = {"tz": APP_TIMEZONE}
    local_data = LOCAL.format(col="data")
    is_today = f"{local_data}::date = (now() AT TIME ZONE %(tz)s)::date"

    with connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT
                    COUNT(*) FILTER (WHERE tipo = 'entrada') AS entradas,
                    COUNT(*) FILTER (WHERE tipo = 'saida') AS saidas,
                    COUNT(*) FILTER (WHERE tipo = 'recusada') AS recusadas,
                    COALESCE(SUM(valor) FILTER (WHERE tipo = 'saida'), 0)
                        AS receita,
                    AVG(permanencia_min) FILTER (WHERE tipo = 'saida')
                        AS permanencia_media_min
                FROM entradas
                WHERE {is_today}
                """,
                params,
            )
            totals = cursor.fetchone()

            cursor.execute(
                f"""
                SELECT EXTRACT(HOUR FROM {local_data})::int AS hora,
                       COALESCE(SUM(valor), 0) AS valor
                FROM entradas
                WHERE tipo = 'saida' AND {is_today}
                GROUP BY 1
                ORDER BY 1
                """,
                params,
            )
            by_hour = {row["hora"]: float(row["valor"]) for row in cursor.fetchall()}

            cursor.execute(
                f"""
                SELECT COALESCE(SUM(valor), 0) AS total
                FROM recargas
                WHERE {is_today}
                """,
                params,
            )
            top_ups = float(cursor.fetchone()["total"])

            cursor.execute(
                """
                SELECT COUNT(*) AS total
                FROM placas p
                WHERE (
                    SELECT tipo FROM entradas e
                    WHERE e.numero_placa = p.numero_placa
                      AND e.tipo IN ('entrada', 'saida')
                    ORDER BY data DESC, id DESC
                    LIMIT 1
                ) = 'entrada'
                """
            )
            inside = int(cursor.fetchone()["total"])

            cursor.execute(
                "SELECT COUNT(*) FILTER (WHERE ocupada) AS ocupadas, "
                "COUNT(*) AS total FROM vagas"
            )
            spots = cursor.fetchone()

            cursor.execute("SELECT EXTRACT(HOUR FROM now() AT TIME ZONE %(tz)s)::int AS h", params)
            current_hour = cursor.fetchone()["h"]

    first_hour = min([8, *by_hour.keys()])
    revenue_by_hour = [
        {"hora": hour, "valor": round(by_hour.get(hour, 0.0), 2)}
        for hour in range(first_hour, max(current_hour, first_hour) + 1)
    ]

    average = totals["permanencia_media_min"]
    return {
        "vagas_ocupadas": int(spots["ocupadas"]),
        "vagas_total": int(spots["total"]),
        "veiculos_no_patio": inside,
        "entradas": int(totals["entradas"]),
        "saidas": int(totals["saidas"]),
        "saidas_recusadas": int(totals["recusadas"]),
        "receita": round(float(totals["receita"]), 2),
        "recargas": round(top_ups, 2),
        "permanencia_media_min": round(float(average), 1) if average else None,
        "receita_por_hora": revenue_by_hour,
    }
