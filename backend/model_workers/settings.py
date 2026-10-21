"""Pure worker setting validation, independent of Torch/model imports."""
def cpu_thread_count(value: str) -> int | None:
    value = value.strip()
    if not value:
        return None
    if len(value) > 3 or not value.isascii() or not value.isdigit() or not 1 <= int(value) <= 256:
        raise ValueError("TEXTELLER_CPU_THREADS must be an integer in 1..256")
    return int(value)
