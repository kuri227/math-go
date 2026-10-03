$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$BasePython = Join-Path $RepoRoot ".venv\Scripts\python.exe"

Push-Location $RepoRoot
try {
    $env:TEXTELLER_DEVICE = "cuda"
    Write-Host "[phase] Resume TexTeller / UniMER-Test HWE"
    & $BasePython -u -m benchmark.run_benchmark --dataset public --models texteller --warmup 1 --output results\public_hwe_predictions.csv --resume

    Write-Host "[phase] Analyze completed TexTeller results"
    & $BasePython -m benchmark.analyze_results --input results\public_hwe_predictions.csv --name public_hwe
    & $BasePython -m benchmark.collect_environment
    & $BasePython -m benchmark.build_comparison_report

    Write-Host "[phase] Start Web collection server on http://127.0.0.1:8000"
    $env:TEXTELLER_DEVICE = "cuda"
    $env:UNIMERNET_DEVICE = "cuda"
    & $BasePython -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
}
finally {
    Pop-Location
}

