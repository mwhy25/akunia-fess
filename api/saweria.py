"""
Vercel Python Serverless Function.
Endpoint: POST /api/saweria  body: {"action": "create" | "status", ...}
Dipanggil HANYA oleh server Next.js (dilindungi header x-secret).
"""
import json
import os
from http.server import BaseHTTPRequestHandler

from saweriaqris import create_payment_qr, paid_status

SAWERIA_USER = os.environ.get("SAWERIA_USERNAME", "")
SECRET = os.environ.get("SAWERIA_SERVICE_SECRET", "")

# Harus sama dengan PACKAGES di lib/constants.ts
ALLOWED_AMOUNTS = {10000, 25000, 50000}


class handler(BaseHTTPRequestHandler):
    def _send(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if not SECRET or self.headers.get("x-secret") != SECRET:
            return self._send(401, {"error": "unauthorized"})
        if not SAWERIA_USER:
            return self._send(500, {"error": "SAWERIA_USERNAME belum di-set"})

        try:
            length = int(self.headers.get("content-length", 0))
            data = json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            return self._send(400, {"error": "body tidak valid"})

        action = data.get("action")

        if action == "create":
            amount = data.get("amount")
            if not isinstance(amount, int) or amount not in ALLOWED_AMOUNTS:
                return self._send(400, {"error": "nominal tidak valid"})
            try:
                res = create_payment_qr(
                    SAWERIA_USER, amount, "Menfess", "noreply@menfess.app",
                    str(data.get("message", ""))[:100],
                )
                return self._send(200, {"qr_string": res[0], "transaction_id": res[1]})
            except Exception as e:
                return self._send(502, {"error": f"saweria gagal: {e}"})

        if action == "status":
            trx = data.get("transaction_id")
            if not isinstance(trx, str) or not trx:
                return self._send(400, {"error": "transaction_id wajib"})
            try:
                return self._send(200, {"paid": bool(paid_status(trx))})
            except Exception as e:
                return self._send(502, {"error": f"saweria gagal: {e}"})

        return self._send(400, {"error": "action tidak dikenal"})
