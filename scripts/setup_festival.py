"""Portable, fail-fast setup for a source clone or a prebuilt ZIP."""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
MODEL_REVISION = "7b96df06b9d81cdb129c3bef68b7250bc3e2b0ea"
MODEL_FILES = ["config.json", "generation_config.json", "model.safetensors", "added_tokens.json", "merges.txt", "special_tokens_map.json", "tokenizer.json", "tokenizer_config.json", "vocab.json"]


def venv_python(root: Path, name: str) -> Path:
    return root / name / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def run(*args: object, cwd: Path = ROOT) -> None:
    subprocess.run([str(arg) for arg in args], cwd=cwd, check=True)


def ensure_venv(name: str) -> Path:
    python = venv_python(ROOT, name)
    if not python.is_file():
        run(sys.executable, "-m", "venv", ROOT / name)
    return python


def install_torch(python: Path, device: str, index: str | None, torch: str, torchvision: str) -> None:
    index = index or f"https://download.pytorch.org/whl/{'cu132' if device == 'cuda' else 'cpu'}"
    run(python, "-m", "pip", "install", f"torch=={torch}", f"torchvision=={torchvision}", "--index-url", index)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--device", choices=["cuda", "cpu"], default="cuda")
    parser.add_argument("--with-evaluation", action="store_true")
    parser.add_argument("--runtime-only", action="store_true")
    parser.add_argument("--skip-build", action="store_true")
    parser.add_argument("--torch-index-url")
    parser.add_argument("--torch-version", default="2.14.0")
    parser.add_argument("--torchvision-version", default="0.29.0")
    parser.add_argument("--unimernet-variant", choices=["tiny", "small", "base"], default="tiny")
    args = parser.parse_args()
    if not (3, 10) <= sys.version_info[:2] < (3, 13) or sys.maxsize <= 2**32:
        parser.error("Use 64-bit Python 3.10-3.12 (3.10 is the validated exhibition environment).")
    if args.device == "cuda" and not shutil.which("nvidia-smi"):
        parser.error("NVIDIA driver not found. Install a compatible driver or explicitly use --device cpu.")
    source = (ROOT / "game/package.json").is_file()
    if not args.skip_build and source and (not shutil.which("node") or not shutil.which("pnpm")):
        parser.error("A source clone needs Node.js >=22.12 and pnpm 11.25.0 on PATH.")

    base = ensure_venv(".venv")
    run(base, "-m", "pip", "install", "--upgrade", "pip")
    requirements = ROOT / "requirements" / ("festival.txt" if args.runtime_only else "test.txt")
    target = str(ROOT) if args.runtime_only else f"{ROOT}[benchmark,test]"
    # Resolve exact requirements and the editable package together; constraint
    # files cannot contain extras such as uvicorn[standard].
    run(base, "-m", "pip", "install", "-r", requirements, "-e", target)
    run(base, "-m", "pip", "check")

    model = ensure_venv(".venv-texteller")
    run(model, "-m", "pip", "install", "--upgrade", "pip")
    install_torch(model, args.device, args.torch_index_url, args.torch_version, args.torchvision_version)
    run(model, "-m", "pip", "install", "texteller==1.0.2", "huggingface-hub==0.36.2")
    run(model, "-m", "pip", "check")
    download = "from huggingface_hub import snapshot_download; import sys; snapshot_download(repo_id='OleehyO/TexTeller', revision=sys.argv[2], local_dir=sys.argv[1], allow_patterns=sys.argv[3:], max_workers=1)"
    run(model, "-c", download, ROOT / ".model-cache/texteller", MODEL_REVISION, *MODEL_FILES)
    if args.device == "cuda":
        run(model, "-c", "import torch; assert torch.cuda.is_available(), 'CUDA unavailable: check driver/wheel compatibility'; print(torch.__version__, torch.cuda.get_device_name(0))")

    if args.with_evaluation:
        repository = ROOT / "third_party/UniMERNet"
        if not repository.is_dir():
            run("git", "clone", "https://github.com/opendatalab/UniMERNet.git", repository)
        uni = ensure_venv(".venv-unimernet")
        install_torch(uni, args.device, args.torch_index_url, args.torch_version, args.torchvision_version)
        run(uni, "-m", "pip", "install", "-e", repository, "huggingface-hub==0.36.2")
        run(uni, "-c", "from huggingface_hub import snapshot_download; import sys; snapshot_download(repo_id=sys.argv[1], local_dir=sys.argv[2], max_workers=1)", f"wanderkid/unimernet_{args.unimernet_variant}", repository / f"models/unimernet_{args.unimernet_variant}")
        run(uni, "-m", "pip", "check")

    if source and not args.skip_build:
        pnpm = shutil.which("pnpm")
        run(pnpm, "install", "--frozen-lockfile", cwd=ROOT / "game")
        run(pnpm, "build", cwd=ROOT / "game")
    run(base, ROOT / "scripts/preflight.py", "--require-ready", "--device", args.device)
    print("Setup complete. See docs/festival-operation.md for startup and rehearsal.")


if __name__ == "__main__":
    try:
        main()
    except (subprocess.CalledProcessError, OSError) as exc:
        print(f"Setup stopped: {exc}. Fix the failing step and rerun.", file=sys.stderr)
        sys.exit(1)
