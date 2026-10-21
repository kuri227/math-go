"""No model dependencies: real child-process faults for lifecycle regression tests."""
import json
import os
import sys
import time
from pathlib import Path


def emit(payload):
    print("@@HMER_JSON@@" + json.dumps(payload), flush=True)


mode = os.environ.get("TEST_WORKER_MODE", "ok")
if os.environ.get("TEST_PID_PATH"):
    Path(os.environ["TEST_PID_PATH"]).write_text(str(os.getpid()), encoding="ascii")
if mode == "startup-hang":
    time.sleep(60)
    sys.exit()
print("library noise", flush=True)
print("@@HMER_JSON@@not-json", flush=True)
emit({"status": "ready"})
for line in sys.stdin:
    request = json.loads(line)
    if request.get("command") == "shutdown":
        break
    if mode == "hang":
        time.sleep(60)
    if mode == "exit":
        break
    emit({"request_id": "wrong" if mode == "mismatch" else request["request_id"], "latex": "1", "inference_ms": 1})
