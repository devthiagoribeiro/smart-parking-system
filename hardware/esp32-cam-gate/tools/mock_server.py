"""Servidor de teste para a ESP32-CAM da entrada.

Imita a API do time (backend/api) para testar o firmware sem Postgres/OCR:

  POST /plates/recognize   multipart com o campo "image" (igual à API real)
       200 {"success": true, "plate", "processing_time_ms", "saldo", "tipo"}
       200 {"success": false, "plate": null, ...}          placa não reconhecida
       400 {"detail": "Saldo insuficiente ..."}            saída sem saldo

  Regras copiadas da API: placa nova entra com saldo 100; cada reconhecimento
  alterna entrada/saída; na saída cobra R$3/h nas 3 primeiras horas e R$1/h
  depois (proporcional). Tudo fica em memória (some ao reiniciar).

  POST /api/gate/entry     formato antigo (JPEG puro -> {"authorized": ...}),
                           mantido para firmwares antigos.

Modos:
  allow  -> sempre reconhece --fake-plate
  deny   -> nunca reconhece placa (success=false)
  full   -> recusa com 400 "Estacionamento lotado." (cenário de teste)
  ocr    -> roda o pipeline real (YOLO + PaddleOCR) do repositório

Uso:
  python hardware/esp32-cam-gate/tools/mock_server.py --mode allow --port 8080
  python hardware/esp32-cam-gate/tools/mock_server.py --mode allow --saldo 0   (testa saldo insuficiente)
  python hardware/esp32-cam-gate/tools/mock_server.py --mode ocr --port 8080
"""

import argparse
import json
import sys
import threading
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
CAPTURES = HERE / "captures"
MAX_BYTES = 2 * 1024 * 1024

args = None
process_image = None
plates = {}            # placa -> {"saldo": float, "eventos": [timestamp, ...]}
lock = threading.Lock()


def load_pipeline():
    backend = HERE.parents[2] / "backend"
    sys.path.insert(0, str(backend))
    from license_plate_service.services.plate_service import process_image as fn  # noqa: E402

    return fn


def recognize(image_path):
    """Devolve a placa lida (ou None) e o tempo em ms."""
    t0 = time.perf_counter()
    if args.mode == "deny":
        return None, 0
    if args.mode != "ocr":
        return args.fake_plate, round((time.perf_counter() - t0) * 1000, 2)
    try:
        result = process_image(str(image_path))
    except Exception as exc:  # YOLO sem detecção levanta IndexError
        print(f"  pipeline falhou: {exc!r}")
        return None, 0
    if not result.get("success"):
        return None, 0
    return result["plate"], result.get("processing_time_ms", 0)


def register(plate):
    """Mesma regra de backend/api/database.py: alterna entrada/saída e cobra na saída."""
    with lock:
        rec = plates.setdefault(plate, {"saldo": float(args.saldo), "eventos": []})
        now = time.time()
        tipo = "entrada" if (len(rec["eventos"]) + 1) % 2 == 1 else "saida"
        if tipo == "saida":
            horas = (now - rec["eventos"][-1]) / 3600
            valor = round(min(horas, 3) * 3 + max(horas - 3, 0), 2)
            if rec["saldo"] < valor:
                return 400, {"detail": "Saldo insuficiente para pagar a permanência da placa."}
            rec["saldo"] = round(rec["saldo"] - valor, 2)
        rec["eventos"].append(now)
        return 200, {"saldo": rec["saldo"], "tipo": tipo}


def extract_multipart(content_type, body):
    """Extrai o arquivo do campo "image" de um corpo multipart/form-data."""
    if "boundary=" not in content_type:
        return None
    boundary = content_type.split("boundary=", 1)[1].split(";")[0].strip().strip('"').encode()
    for part in body.split(b"--" + boundary):
        if b'name="image"' not in part.split(b"\r\n\r\n", 1)[0]:
            continue
        data = part.split(b"\r\n\r\n", 1)[1]
        return data[:-2] if data.endswith(b"\r\n") else data
    return None


class Handler(BaseHTTPRequestHandler):
    def _json(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            return self._json(200, {"status": "ok", "mode": args.mode})
        if self.path == "/plates":
            return self._json(200, plates)
        self._json(404, {"detail": "Not Found"})

    def _read_image(self):
        length = int(self.headers.get("Content-Length", 0))
        if length <= 0 or length > MAX_BYTES:
            return None, (413, {"detail": "tamanho inválido"})
        body = self.rfile.read(length)
        ctype = self.headers.get("Content-Type", "")
        data = extract_multipart(ctype, body) if ctype.startswith("multipart/") else body
        if not data or not data.startswith(b"\xff\xd8"):
            return None, (422, {"detail": "campo 'image' ausente ou não é JPEG"})
        device = self.headers.get("X-Device-Id", "unknown")
        CAPTURES.mkdir(exist_ok=True)
        path = CAPTURES / f"{datetime.now():%Y%m%d-%H%M%S}-{device}.jpg"
        path.write_bytes(data)
        return path, None

    def do_POST(self):
        if self.path not in ("/plates/recognize", "/api/gate/entry"):
            return self._json(404, {"detail": "Not Found"})
        if args.api_key and self.headers.get("X-Api-Key") != args.api_key:
            return self._json(401, {"detail": "invalid_api_key"})
        path, err = self._read_image()
        if err:
            return self._json(*err)

        plate, ms = recognize(path)
        if self.path == "/api/gate/entry":   # formato antigo
            code, resp = 200, {"authorized": plate is not None, "plate": plate,
                               "reason": "ok" if plate else "plate_not_found"}
        elif args.mode == "full":
            code, resp = 400, {"detail": "Estacionamento lotado."}
        elif plate is None:
            code, resp = 200, {"success": False, "plate": None, "processing_time_ms": 0}
        else:
            code, extra = register(plate)
            resp = extra if code != 200 else {"success": True, "plate": plate,
                                              "processing_time_ms": ms, **extra}
        print(f"{path.name} | {self.path} -> {code} {resp}")
        self._json(code, resp)

    def log_message(self, fmt, *a):
        pass


def main():
    global args, process_image
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--mode", choices=["allow", "deny", "full", "ocr"], default="allow")
    p.add_argument("--fake-plate", default="SPK2A26", help="placa devolvida no modo allow")
    p.add_argument("--saldo", type=float, default=100.0, help="saldo inicial de placa nova")
    p.add_argument("--api-key", default="", help="exige este X-Api-Key (vazio = não exige)")
    p.add_argument("--host", default="0.0.0.0")
    p.add_argument("--port", type=int, default=8080)
    args = p.parse_args()

    if args.mode == "ocr":
        print("Carregando YOLO + PaddleOCR...")
        process_image = load_pipeline()

    print(f"Modo {args.mode} | POST http://<ip-do-pc>:{args.port}/plates/recognize | fotos em {CAPTURES}")
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
