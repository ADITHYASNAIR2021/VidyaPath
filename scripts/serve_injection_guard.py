"""Optional local, no-inference-fee injection classifier. No request text is logged.
Install torch + transformers in a dedicated environment, then run this script.
This classifies text injection attempts; it does not certify factual or visual safety.
"""
import hmac
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import BoundedSemaphore

os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
import torch
from transformers import pipeline

MODEL = "protectai/deberta-v3-base-prompt-injection-v2"
TOKEN = os.environ.get("AI_INJECTION_GUARD_TOKEN", "")
CACHE = Path(__file__).resolve().parent.parent / ".cache" / "injection-guard"
torch.set_num_threads(min(4, os.cpu_count() or 1))
classifier = pipeline("text-classification", model=MODEL, device=-1, model_kwargs={"cache_dir": str(CACHE)}, trust_remote_code=False)
slots = BoundedSemaphore(2)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass  # No prompts, answers, auth headers or access logs.

    def send_json(self, status, value):
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path != "/health":
            return self.send_json(404, {"error": "not-found"})
        self.send_json(200, {"ready": True, "model": MODEL, "scope": "text injection classification only"})

    def do_POST(self):
        if self.path != "/classify":
            return self.send_json(404, {"error": "not-found"})
        if TOKEN and not hmac.compare_digest(self.headers.get("Authorization", ""), f"Bearer {TOKEN}"):
            return self.send_json(401, {"error": "unauthorized"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 262144:
                return self.send_json(413, {"error": "size-limit"})
            payload = json.loads(self.rfile.read(size))
            text = payload.get("text")
            if not isinstance(text, str) or len(text) > 64000:
                return self.send_json(422, {"error": "invalid-text"})
        except (ValueError, json.JSONDecodeError):
            return self.send_json(422, {"error": "invalid-json"})
        if not slots.acquire(blocking=False):
            return self.send_json(503, {"error": "busy"})
        try:
            # Token-aware overlapping windows avoid silently ignoring a malicious tail.
            tokens = classifier.tokenizer.encode(text, add_special_tokens=False)
            windows = [classifier.tokenizer.decode(tokens[start:start + 480]) for start in range(0, max(1, len(tokens)), 384)]
            results = classifier(windows, truncation=True, max_length=512, batch_size=4)
            unsafe = any(str(item["label"]).upper() in ("INJECTION", "LABEL_1") and item["score"] >= 0.5 for item in results)
            self.send_json(200, {"safe": not unsafe, "model": MODEL, "windows": len(windows)})
        except Exception:
            self.send_json(503, {"error": "classification-failed"})
        finally:
            slots.release()


if __name__ == "__main__":
    print(f"Local injection classifier ready: {MODEL}; listening only on 127.0.0.1:8899")
    ThreadingHTTPServer(("127.0.0.1", 8899), Handler).serve_forever()
