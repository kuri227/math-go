"""A process-local protocol inbox; a stalled pipe never blocks the caller forever."""
import json
import queue
import threading
from typing import TextIO

PROTOCOL_PREFIX = "@@HMER_JSON@@"


class ProtocolReader:
    def __init__(self, stream: TextIO) -> None:
        self._messages: queue.Queue[dict | None] = queue.Queue()
        self.thread = threading.Thread(target=self._pump, args=(stream,), daemon=True)
        self.thread.start()

    def _pump(self, stream: TextIO) -> None:
        try:
            for line in stream:
                offset = line.find(PROTOCOL_PREFIX)
                if offset < 0:
                    continue
                try:
                    message, _ = json.JSONDecoder().raw_decode(line[offset + len(PROTOCOL_PREFIX):])
                except json.JSONDecodeError:
                    continue
                if isinstance(message, dict):
                    self._messages.put(message)
        finally:
            self._messages.put(None)

    def read(self, timeout: float) -> dict | None:
        try:
            return self._messages.get(timeout=timeout)
        except queue.Empty as error:
            raise TimeoutError("Recognition worker response deadline exceeded") from error
