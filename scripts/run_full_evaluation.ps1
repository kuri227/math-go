param(
    [ValidateSet("auto", "cuda", "cpu")]
    [string]$Device = "cuda"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$BasePython = Join-Path $RepoRoot ".venv\Scripts\python.exe"

Push-Location $RepoRoot
try {
    $env:TEXTELLER_DEVICE = $Device
    $env:UNIMERNET_DEVICE = $Device
    Write-Host "[phase] TexTeller / UniMER-Test HWE"
    & $BasePython -u -m benchmark.run_benchmark --dataset public --models texteller --warmup 1 --output results\public_hwe_predictions.csv --resume

    Write-Host "[phase] UniMERNet / UniMER-Test HWE"
    & $BasePython -u -m benchmark.run_benchmark --dataset public --models unimernet --warmup 1 --output results\public_hwe_predictions.csv --resume

    Write-Host "[phase] Analyze public HWE"
    & $BasePython -m benchmark.analyze_results --input results\public_hwe_predictions.csv --name public_hwe
    & $BasePython -m benchmark.collect_environment
    & $BasePython -m benchmark.build_comparison_report
    Write-Host "[done] Full public HWE evaluation completed"
}
finally {
    Pop-Location
}

