"""Read-only API diagnostics plus synthetic validation errors; no sample/bank writes."""
from __future__ import annotations

import argparse
from io import BytesIO
import json
from pathlib import Path
import statistics
import struct
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import zlib

from PIL import Image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    records = []
    def check(name, path, expected=200, data=None, headers=None):
        began = time.perf_counter()
        try:
            with urlopen(Request(args.base_url.rstrip("/") + path, data=data, headers=headers or {}), timeout=15) as response:
                status, body = response.status, response.read()
        except HTTPError as error:
            status, body = error.code, error.read()
        records.append({"name": name, "status": status, "expected": expected, "passed": status == expected,
                        "elapsed_ms": round((time.perf_counter() - began) * 1000, 2)})
        return body
    for path in ("/", "/display", "/controller", "/evaluation", "/questions/editor", "/health", "/models", "/api/v1/questions"):
        check(path, path)
    check("local math CSS", "/support.css")
    check("local shared module", "/game-assets/support.js")
    check("admin cross-origin protection", "/api/v1/admin/questions", 403, b"{}", {"Content-Type": "application/json", "Origin": "https://invalid.example"})
    check("admin Host protection", "/questions/editor", 403, headers={"Host": "invalid.example"})
    questions = json.loads(check("public bank", "/api/v1/questions"))
    assert all("answer" not in question and "answer_latex" not in question for question in questions)
    for _ in range(10): check("health latency", "/api/v1/health/live")
    for correct, qid, latex, expected in ((True, "d1-s1-r01-v01", "3", 200), (False, "d1-s1-r01-v01", "4", 200), (False, "missing", "3", 404)):
        body = check("judge", "/api/v1/judgements", expected, json.dumps({"question_id": qid, "recognized_latex": latex}).encode(), {"Content-Type": "application/json"})
        if expected == 200: assert json.loads(body)["correct"] is correct
    check("solution", "/api/v1/solutions/d1-s1-r01-v01")
    check("unknown solution", "/api/v1/solutions/missing", 404)
    image = BytesIO(); Image.new("RGB", (10, 10), "white").save(image, format="PNG")
    png = bytearray(image.getvalue())
    png[16:24] = struct.pack(">II", 5000, 5000)
    png[29:33] = struct.pack(">I", zlib.crc32(png[12:29]) & 0xffffffff)
    bmp = BytesIO(); Image.new("RGB", (10, 10), "white").save(bmp, format="BMP")
    for name, payload, model, code in (("empty", b"", "texteller", 400), ("corrupt", b"invalid", "texteller", 400),
                                      ("unknown model", image.getvalue(), "unknown", 400), ("unsupported format", bmp.getvalue(), "texteller", 415),
                                      ("pixel limit", bytes(png), "texteller", 413)):
        boundary = "math-go-audit"
        data = (f'--{boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n{model}\r\n'
                f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n').encode() + payload + f"\r\n--{boundary}--\r\n".encode()
        check(name, "/api/v1/recognitions", code, data, {"Content-Type": f"multipart/form-data; boundary={boundary}"})
    latency = [r["elapsed_ms"] for r in records if r["name"] == "health latency"]
    result = {"checks": len(records), "failed": sum(not r["passed"] for r in records), "questions": len(questions),
              "health_median_ms": statistics.median(latency), "health_max_ms": max(latency), "records": records}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k != "records"}, indent=2))
    raise SystemExit(bool(result["failed"]))


if __name__ == "__main__":
    main()
