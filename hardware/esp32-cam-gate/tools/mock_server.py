"""Servidor de teste para a ESP32-CAM da entrada.

Implementa o mesmo contrato que a API real deve seguir (ver README do
hardware), para testar o firmware antes do backend ficar pronto.

Modos:
  allow  -> sempre libera (testa cancela)
  deny   -> sempre nega (testa LED vermelho / novas tentativas)
  full   -> nega com reason=parking_full (cenário estacionamento lotado)
  ocr    -> roda o pipeline real (YOLO + PaddleOCR) e libera se a placa
            estiver em --plates

Uso:
  python hardware/esp32-cam-gate/tools/mock_server.py --mode allow
  python hardware/esp32-cam-gate/tools/mock_server.py --mode ocr --plates ABC1D23,XYZ9876
"""

import argparse
import json
import sys
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
CAPTURES = HERE / "captures"
ENDPOINT = "/api/gate/entry"
MAX_BYTES = 2 * 1024 * 1024

args = None
process_image = None


def load_pipeline():
    service_dir = HERE.parents[2] / "backend" / "license_plate_service" / "services"
    sys.path.insert(0, str(service_dir))
    from plate_service import process_image as fn  # noqa: E402

    return fn


def decide(image_path):
    if args.mode == "allow":
        return {"authorized": True, "plate": args.fake_plate, "reason": "ok"}
    if args.mode == "deny":
        return {"authorized": False, "plate": args.fake_plate, "reason": "not_registered"}
    if args.mode == "full":
        return {"authorized": False, "plate": args.fake_plate, "reason": "parking_full"}

    try:
        result = process_image(str(image_path))
    except Exception as exc:  # YOLO sem detecção levanta IndexError
        print(f"  pipeline falhou: {exc!r}")
        result = {"success": False, "plate": None}

    plate = result.get("plate")
    if not result.get("success") or not plate:
        return {"authorized": False, "plate": None, "reason": "plate_not_found"}
    if plate not in args.plates:
        return {"authorized": False, "plate": plate, "reason": "not_registered"}
    return {"authorized": True, "plate": plate, "reason": "ok"}


class Handler(BaseHTTPRequestHandler):
    def _json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            return self._json(200, {"status": "ok", "mode": args.mode})
        self._json(404, {"error": "not_found"})

    def do_POST(self):
        if self.path != ENDPOINT:
            return self._json(404, {"error": "not_found"})
        if self.headers.get("Content-Type") != "image/jpeg":
            return self._json(415, {"error": "expected image/jpeg"})
        if args.api_key and self.headers.get("X-Api-Key") != args.api_key:
            return self._json(401, {"error": "invalid_api_key"})

        length = int(self.headers.get("Content-Length", 0))
        if length <= 0 or length > MAX_BYTES:
            return self._json(413, {"error": "invalid_size"})
        data = self.rfile.read(length)
        if not data.startswith(b"\xff\xd8"):
            return self._json(400, {"error": "not_a_jpeg"})

        device = self.headers.get("X-Device-Id", "unknown")
        CAPTURES.mkdir(exist_ok=True)
        path = CAPTURES / f"{datetime.now():%Y%m%d-%H%M%S}-{device}.jpg"
        path.write_bytes(data)

        t0 = time.perf_counter()
        decision = decide(path)
        ms = (time.perf_counter() - t0) * 1000
        print(f"[{device}] {len(data)} bytes -> {path.name} | {decision} ({ms:.0f} ms)")
        self._json(200, decision)

    def log_message(self, fmt, *a):
        pass


def main():
    global args, process_image
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--mode", choices=["allow", "deny", "full", "ocr"], default="allow")
    p.add_argument("--plates", default="", help="placas cadastradas (modo ocr), separadas por vírgula")
    p.add_argument("--fake-plate", default="ABC1D23", help="placa devolvida nos modos allow/deny/full")
    p.add_argument("--api-key", default="", help="exige este X-Api-Key (vazio = não exige)")
    p.add_argument("--host", default="0.0.0.0")
    p.add_argument("--port", type=int, default=8000)
    args = p.parse_args()
    args.plates = {s.strip().upper() for s in args.plates.split(",") if s.strip()}

    if args.mode == "ocr":
        print("Carregando YOLO + PaddleOCR...")
        process_image = load_pipeline()

    print(f"Modo {args.mode} | POST http://<ip-do-pc>:{args.port}{ENDPOINT} | fotos em {CAPTURES}")
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
