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
`100.0`. If it already exists, the existing record is returned without creating
a duplicate.

Each successful recognition registers an event in the `entradas` table. Events
alternate between `entrada` and `saida` according to the number of previous
records for the plate. A newly recognized plate therefore starts with an
`entrada`.

When the recognition identifies an exit, the parking fee is calculated from the
two most recent records for the plate. The first three hours cost `R$ 3.00`
per hour, and each additional hour costs `R$ 1.00` per hour. Partial hours are
charged proportionally. If the balance is insufficient, the exit is rejected
with status `400`, and the balance and exit event are not changed.

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
