"""Popula o banco com dados fictícios para testar o painel e o app.

Uso (a partir da pasta backend, com o venv da API ativo):

    python -m scripts.seed_demo              # recria os dados de exemplo
    python -m scripts.seed_demo --sensores   # idem + simula os sensores das vagas
    python -m scripts.seed_demo --limpar     # só remove os dados de exemplo
    python -m scripts.seed_demo --zerar      # apaga TUDO (antes da apresentação)

Os horários são relativos ao momento em que o script roda. Só as placas
listadas em DEMO_PLATES são apagadas/recriadas; outros dados ficam intactos.
"""

import argparse
import random
import time

from api.database import (
    _duration,
    _money,
    calculate_fee,
    connect,
    init_db,
    LOW_BALANCE_THRESHOLD,
    SPOT_COUNT,
    update_spot,
)

DEVICE = "gate-entry-01"

# (tipo, placa, minutos atrás, ...)
#   recarga: valor, método
#   sessao:  saída (minutos atrás ou None = ainda no pátio), recusa (minutos atrás ou None)
EVENTS = [
    # Ontem
    ("recarga", "RTQ4F27", 1620, 46.20, "pix"),
    ("sessao", "RTQ4F27", 1500, 1428, None),
    ("recarga", "QAT7J13", 1560, 100.00, "cartao"),
    ("sessao", "QAT7J13", 1490, 1350, None),
    ("recarga", "MRC5H21", 1700, 20.00, "pix"),
    ("sessao", "MRC5H21", 1650, 1580, None),
    # Hoje
    ("recarga", "FJK8C03", 400, 5.00, "pix"),
    ("sessao", "FJK8C03", 395, 185, 191),  # recusada, recarrega e sai
    ("recarga", "FJK8C03", 188, 20.00, "pix"),
    ("recarga", "BRA2E19", 380, 30.00, "pix"),
    ("sessao", "BRA2E19", 300, 275, None),
    ("recarga", "HGT4521", 245, 40.00, "pix"),
    ("sessao", "HGT4521", 240, 60, None),
    ("recarga", "PKD9E40", 260, 50.00, "cartao"),
    ("sessao", "PKD9E40", 250, 160, None),
    ("sessao", "QAT7J13", 210, 102, None),
    ("sessao", "MRC5H21", 150, 95, None),
    ("sessao", "BRA2E19", 80, 52, None),
    ("sessao", "RTQ4F27", 41, None, None),  # estacionado agora
]

DEMO_PLATES = sorted({event[1] for event in EVENTS})
METHOD_LABEL = {"pix": "Pix", "cartao": "cartão"}


def clear(cursor):
    for table in ("notificacoes", "recargas", "entradas"):
        cursor.execute(
            f"DELETE FROM {table} WHERE numero_placa = ANY(%s)", (DEMO_PLATES,)
        )
    cursor.execute("DELETE FROM placas WHERE numero_placa = ANY(%s)", (DEMO_PLATES,))


# Expressão SQL para "agora - N minutos" no fuso da sessão.
AT = "LOCALTIMESTAMP - make_interval(mins => %s)"


def notify(cursor, plate, minutes_ago, kind, title, message, read):
    cursor.execute(
        f"""
        INSERT INTO notificacoes (numero_placa, tipo, titulo, mensagem, lida, data)
        VALUES (%s, %s, %s, %s, %s, {AT})
        """,
        (plate, kind, title, message, read, minutes_ago),
    )


def movement(cursor, plate, minutes_ago, kind, value=None, stay=None):
    cursor.execute(
        f"""
        INSERT INTO entradas
            (numero_placa, tipo, valor, permanencia_min, dispositivo,
             tempo_ocr_ms, data)
        VALUES (%s, %s, %s, %s, %s, %s, {AT})
        """,
        (plate, kind, value, stay, DEVICE, round(random.uniform(105, 190), 1), minutes_ago),
    )


def seed(cursor):
    # Linha do tempo em ordem cronológica (mais antigo primeiro).
    timeline = []
    for event in EVENTS:
        if event[0] == "recarga":
            _, plate, ago, value, method = event
            timeline.append((ago, "recarga", plate, value, method))
        else:
            _, plate, entry, exit_, refusal = event
            timeline.append((entry, "entrada", plate, None, None))
            if refusal is not None:
                timeline.append((refusal, "recusa", plate, entry, None))
            if exit_ is not None:
                timeline.append((exit_, "saida", plate, entry, None))
    timeline.sort(key=lambda item: -item[0])

    balances = {plate: 0.0 for plate in DEMO_PLATES}
    for plate in DEMO_PLATES:
        cursor.execute(
            "INSERT INTO placas (numero_placa, saldo) VALUES (%s, 0)", (plate,)
        )

    for ago, kind, plate, extra, method in timeline:
        # Notificações com mais de 1 h ficam como lidas.
        read = ago > 60
        if kind == "recarga":
            balances[plate] += extra
            cursor.execute(
                f"""
                INSERT INTO recargas (numero_placa, valor, metodo, data)
                VALUES (%s, %s, %s, {AT})
                """,
                (plate, extra, method, ago),
            )
            notify(
                cursor, plate, ago, "recarga", "Recarga confirmada",
                f"{_money(extra)} adicionados via {METHOD_LABEL[method]} (simulado). "
                f"Novo saldo: {_money(balances[plate])}.",
                read,
            )
        elif kind == "entrada":
            movement(cursor, plate, ago, "entrada")
            notify(
                cursor, plate, ago, "entrada", "Entrada registrada",
                f"Placa {plate} lida na portaria. A cobrança será feita "
                "automaticamente na saída.",
                read,
            )
        else:
            stay = float(extra - ago)
            fee = calculate_fee(stay / 60)
            if kind == "recusa" or fee > balances[plate]:
                movement(cursor, plate, ago, "recusada", fee, stay)
                notify(
                    cursor, plate, ago, "saida_recusada", "Saída recusada",
                    f"Saldo insuficiente para {_money(fee)}. Adicione saldo "
                    "para liberar a cancela.",
                    read,
                )
                continue
            balances[plate] = round(balances[plate] - fee, 2)
            movement(cursor, plate, ago, "saida", fee, stay)
            notify(
                cursor, plate, ago, "saida", f"Saída · {_money(fee)} debitado",
                f"Permanência de {_duration(stay)}. "
                f"Saldo restante: {_money(balances[plate])}.",
                read,
            )
            if balances[plate] < LOW_BALANCE_THRESHOLD:
                notify(
                    cursor, plate, ago, "saldo_baixo", "Saldo baixo",
                    f"Seu saldo é de {_money(balances[plate])}. Recarregue "
                    "para não ter a saída recusada.",
                    read,
                )

    for plate, balance in balances.items():
        cursor.execute(
            "UPDATE placas SET saldo = %s WHERE numero_placa = %s",
            (round(balance, 2), plate),
        )

    # Vagas: a 1 livre há 17 min; a 2 ocupada desde a entrada do RTQ4F27.
    cursor.execute(
        f"""
        UPDATE vagas SET ocupada = (id = 2),
            campo_gauss = CASE WHEN id = 2 THEN 0.214 ELSE 0.012 END,
            atualizado_em = CASE WHEN id = 2 THEN {AT} ELSE {AT} END,
            ultima_leitura_em = LOCALTIMESTAMP
        WHERE id <= 2
        """,
        (41, 17),
    )
    return balances


def simulate_sensors():
    """Envia leituras com ruído a cada 2 s, como o ESP32 faria."""
    print("Simulando os sensores das vagas (Ctrl+C para parar)...")
    with connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id, ocupada FROM vagas ORDER BY id")
            state = {row["id"]: row["ocupada"] for row in cursor.fetchall()}
    try:
        while True:
            for spot_id, occupied in state.items():
                base = 0.21 if occupied else 0.012
                update_spot(spot_id, occupied, round(base + random.uniform(-0.01, 0.01), 3))
            time.sleep(2)
    except KeyboardInterrupt:
        print("\nSimulação encerrada.")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--limpar", action="store_true", help="só remove os dados de exemplo")
    parser.add_argument("--sensores", action="store_true", help="simula os sensores após popular")
    parser.add_argument(
        "--zerar",
        action="store_true",
        help="apaga TODOS os dados (placas, movimentações, recargas, avisos) e libera as vagas",
    )
    args = parser.parse_args()

    random.seed(42)
    init_db()
    with connect() as connection:
        with connection.cursor() as cursor:
            if args.zerar:
                cursor.execute("TRUNCATE notificacoes, recargas, entradas, placas RESTART IDENTITY")
                cursor.execute(
                    "UPDATE vagas SET ocupada = FALSE, campo_gauss = NULL, "
                    "atualizado_em = LOCALTIMESTAMP, ultima_leitura_em = NULL"
                )
                print("Banco zerado: pronto para a simulação com dados reais.")
                return
            clear(cursor)
            if args.limpar:
                print(f"Dados de exemplo removidos ({len(DEMO_PLATES)} placas).")
                return
            balances = seed(cursor)

    print("Dados de exemplo criados:")
    for plate, balance in sorted(balances.items()):
        print(f"  {plate}  saldo {_money(balance)}")
    print(f"\nVagas: {SPOT_COUNT}. Use a placa RTQ4F27 no app (está estacionada agora).")

    if args.sensores:
        simulate_sensors()


if __name__ == "__main__":
    main()
