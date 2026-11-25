# Smart Parking API

This directory contains the FastAPI application that receives vehicle images,
recognizes license plates, and stores recognized plates and balances in
PostgreSQL.

## Requirements

- Docker Desktop
- Python 3.12
- PowerShell on Windows

Python 3.12 is required because the OCR dependencies include PaddlePaddle,
which is not available for the Python 3.14 environment.

## Start PostgreSQL

Run these commands from the repository root:

```powershell
cd C:\Users\jarvi\Downloads\Instrumentacao\smart-parking-system
docker compose up -d postgres
docker compose ps
```

The Docker database uses these development credentials:

```text
Host: localhost
Port: 15432
Database: smart_parking
User: postgres
Password: postgres
```

The database data is persisted in the
`smart_parking_postgres_data` Docker volume.

## Set up the Python environment

Run these commands from `backend`:

```powershell
cd C:\Users\jarvi\Downloads\Instrumentacao\smart-parking-system\backend

py -3.12 -m venv api\venv-py312
.\api\venv-py312\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r api\requirements.txt
```

If the virtual environment already exists, only activate it and install the
requirements when dependencies have changed.

## Configure the database connection

Set the connection string in the same PowerShell session used to start the API:

```powershell
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:15432/smart_parking"
```

The `placas` and `entradas` tables are created automatically when the API
starts.

## Start the API

Run from `backend`, not from `backend\api`:

```powershell
uvicorn api.main:app --reload
```

The API is available at <http://127.0.0.1:8000>.
Interactive API documentation is available at
<http://127.0.0.1:8000/docs>.

## Plate and balance endpoints

Create a plate manually with an initial balance:

```powershell
curl.exe -X POST "http://127.0.0.1:8000/plates" `
  -H "Content-Type: application/json" `
  -d '{\"numero_placa\":\"ABC1D23\",\"saldo\":100}'
```

Add balance to an existing plate:

```powershell
curl.exe -X POST "http://127.0.0.1:8000/plates/ABC1D23/balance" `
  -H "Content-Type: application/json" `
  -d '{\"valor\":50}'
```

The manual creation endpoint returns `409` if the plate is already registered.
The balance endpoint returns `404` if the plate does not exist.

## Recognize a plate

Use the `/plates/recognize` endpoint with a multipart image upload:

```powershell
curl.exe -X POST "http://127.0.0.1:8000/plates/recognize" `
  -F "image=@C:\Users\jarvi\Downloads\Instrumentacao\smart-parking-system\backend\license_plate_service\images\test_images\placa-2.jpg"
```

For a recognized plate, the response includes the OCR result, processing time,
the current balance, and the event type:

```json
{
  "success": true,
  "plate": "QAT7J13",
  "processing_time_ms": 138.42,
  "saldo": 100.0,
  "tipo": "entrada"
}
```

If the plate does not exist, it is inserted into PostgreSQL with a balance of
`0.0` (configurable, see below). If it already exists, the existing record is
returned without creating a duplicate.

Each successful recognition registers an event in the `entradas` table. A
newly recognized plate starts with an `entrada`; see *Entry/exit rules* below.

When the recognition identifies an exit, the parking fee is calculated from the
two most recent records for the plate. The first three hours cost `R$ 3.00`
per hour, and each additional hour costs `R$ 1.00` per hour. Partial hours are
charged proportionally. If the balance is insufficient, the exit is rejected
with status `400`, and the balance and exit event are not changed.

## Entry/exit rules (updated)

Each event is now stored with its type (`entrada`, `saida` or `recusada`) in
the `entradas` table, together with the charged amount, the stay in minutes,
the device id (`X-Device-Id` header) and the OCR time. Old rows without a
type are migrated on startup using the original parity rule.

- Without extra information the direction alternates: if the plate is inside
  the parking lot the read is an exit, otherwise an entry.
- A second read of the same plate within `DUPLICATE_READ_SECONDS` (default
  5 s) does not create a new event; the response has `"duplicada": true`.
- A dedicated camera can force the direction: list its id in
  `ENTRY_DEVICE_IDS` / `EXIT_DEVICE_IDS`, or send `?tipo=entrada|saida`.
  An exit read for a plate that is not inside returns `409`.
- A refused exit (insufficient balance) still returns `400` for the
  ESP32-CAM, but is recorded as `recusada` and the customer is notified.
- A plate recognized for the first time is created with
  `RECOGNIZED_PLATE_INITIAL_BALANCE` (default `0`). Customers register and
  choose whether to top up through the app.

The recognize response now also includes `duplicada`, `valor_cobrado` and
`permanencia_min`.

## Endpoints used by the frontend

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | API status |
| `GET` | `/pricing` | Parking fee rules |
| `GET` | `/plates` | All plates with balance and whether they are inside |
| `POST` | `/plates` | Register a plate (`{"numero_placa": "ABC1D23"}`, balance defaults to 0) |
| `GET` | `/plates/{placa}` | Balance, `no_patio`, `entrada_em`, unread notifications |
| `POST` | `/plates/{placa}/balance` | Simulated top-up: `{"valor": 50, "metodo": "pix" \| "cartao"}` |
| `GET` | `/plates/{placa}/history` | Entries, exits, refusals and top-ups |
| `GET` | `/plates/{placa}/notifications` | Customer notifications |
| `POST` | `/plates/{placa}/notifications/read` | Mark all as read |
| `GET` | `/events?limit=&tipo=` | Latest events of all plates |
| `GET` | `/stats/today` | Dashboard indicators and revenue per hour |
| `GET` | `/spots` | Parking spot states |
| `PUT` | `/spots/{id}` | Update a spot: `{"ocupada": true, "campo_gauss": 0.21}` |

### Parking spot integration (MQTT)

The spot sensors are not wired to the API by the firmware yet. Whoever
implements the MQTT bridge only needs to call, for each reading or state
change:

```powershell
curl.exe -X PUT "http://127.0.0.1:8000/spots/1" `
  -H "Content-Type: application/json" `
  -d '{\"ocupada\":true,\"campo_gauss\":0.214}'
```

`campo_gauss` (the |Δ field| measured by the HMC5883L) is optional and feeds
the chart on the dashboard. `atualizado_em` only changes when the state
changes; `ultima_leitura_em` changes on every call and tells the dashboard
whether the sensor is online. The number of spots comes from `SPOT_COUNT`
(default `2`, as in `hardware/main/main.c`).

### Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:15432/smart_parking` | Database |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Frontend origins |
| `SPOT_COUNT` | `2` | Number of monitored spots |
| `RECOGNIZED_PLATE_INITIAL_BALANCE` | `0` | Balance of a plate first seen by the camera |
| `LOW_BALANCE_THRESHOLD` | `10` | Below this the customer gets a low-balance notice |
| `DUPLICATE_READ_SECONDS` | `5` | Window to ignore repeated reads |
| `ENTRY_DEVICE_IDS` / `EXIT_DEVICE_IDS` | empty | Comma-separated camera ids per direction |
| `APP_TIMEZONE` | `America/Sao_Paulo` | Time zone for daily statistics |

To let the frontend on another device reach the API, start Uvicorn with
`--host 0.0.0.0` and add that origin to `CORS_ORIGINS`.

## Demo data

Run from `backend` with the virtual environment active:

```powershell
python -m scripts.seed_demo              # fake plates, top-ups, entries/exits and notifications
python -m scripts.seed_demo --sensores   # same, then simulates the spot sensors (Ctrl+C stops)
python -m scripts.seed_demo --limpar     # removes only the demo plates
python -m scripts.seed_demo --zerar      # wipes ALL data and frees the spots (before a real demo)
```

Times are relative to when the script runs. Use plate `RTQ4F27` in the
customer app: it is parked right now.

## Inspect the database

```powershell
docker exec smart-parking-postgres `
  psql -U postgres -d smart_parking `
  -c "SELECT numero_placa, saldo FROM placas;"
```

To inspect the entry and exit events:

```powershell
docker exec smart-parking-postgres `
  psql -U postgres -d smart_parking `
  -c "SELECT id, numero_placa, data FROM entradas ORDER BY data DESC;"
```

## Stop the services

Stop the PostgreSQL container while preserving its data:

```powershell
docker compose down
```

To remove the container and all stored database data:

```powershell
docker compose down -v
```

## Troubleshooting

- Use `api.main:app` when starting Uvicorn from `backend`.
- If the connection error mentions port `5432`, reset `DATABASE_URL` to use
  port `15432`.
- The first recognition request may take longer because PaddleOCR downloads
  and caches its models under the user's local PaddleX directory.
