import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[2]))
from backend.training.execution_lock import execution_lock

with execution_lock(Path(sys.argv[1])):
    Path(sys.argv[2]).touch()
    sys.stdin.read(1)
