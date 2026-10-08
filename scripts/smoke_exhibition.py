"""Exercise a running production API with synthetic input (not an accuracy benchmark)."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import json
from pathlib import Path
import statistics
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError

from PIL import Image, ImageDraw


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--requests", type=int, default=30)
    parser.add_argument("--concurrency", type=int, default=2)
    parser.add_argument("--expected-device", choices=["cpu", "cuda"])
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.requests < 1 or args.concurrency < 1:
        parser.error("requests and concurrency must be positive")
    base = args.base_url.rstrip("/")

    def get(path: str):
        with urlopen(base + path, timeout=120) as response:
            return response.read(), response.headers

    for path in ("/", "/display", "/controller", "/api/v1/questions"):
        body, _ = get(path)
        assert body, path
    ready = json.loads(get("/api/v1/health/ready?model=texteller")[0])
    assert ready["status"] == "ready", ready
    if args.expected_device:
        assert ready["device"] == args.expected_device, ready
    image = Image.new("RGB", (260, 140), "white")
    draw = ImageDraw.Draw(image)
    draw.line([(40, 45), (60, 25), (60, 115)], fill="black", width=6)
    draw.line([(105, 45), (125, 25), (155, 25), (175, 45), (165, 65), (110, 115), (180, 115)], fill="black", width=6)
    png = BytesIO()
    image.save(png, format="PNG")

    def recognize(index: int):
        boundary = f"math-go-smoke-{index}"
        prefix = (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\ntexteller\r\n"
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"request_id\"\r\n\r\nsmoke-{index}\r\n"
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"synthetic.png\"\r\nContent-Type: image/png\r\n\r\n"
        ).encode()
        request = Request(base + "/api/v1/recognitions", data=prefix + png.getvalue() + f"\r\n--{boundary}--\r\n".encode(), headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
        start = time.perf_counter()
        try:
            with urlopen(request, timeout=120) as response:
                result = json.load(response)
        except HTTPError as exc:
            raise RuntimeError(f"Recognition {index}: HTTP {exc.code}: {exc.read().decode(errors='replace')}") from exc
        assert result["request_id"] == f"smoke-{index}", result
        assert result["normalized_latex"] and result["model"] == "texteller", result
        if args.expected_device:
            assert result["device"] == args.expected_device, result
        return {"elapsed_ms": round((time.perf_counter() - start) * 1000, 1), "latex": result["normalized_latex"], "device": result["device"], "timing": result["timing"]}

    with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        results = list(executor.map(recognize, range(args.requests)))
    report = {"requests": len(results), "concurrency": args.concurrency, "failures": 0, "median_ms": statistics.median(r["elapsed_ms"] for r in results), "max_ms": max(r["elapsed_ms"] for r in results), "results": results}
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key != "results"}, indent=2))


if __name__ == "__main__":
    main()
