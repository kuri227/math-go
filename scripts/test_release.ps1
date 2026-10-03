[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ArchivePath
)

$ErrorActionPreference = "Stop"
$Archive = (Resolve-Path -LiteralPath $ArchivePath).Path
$TestRoot = Join-Path ([IO.Path]::GetTempPath()) ("math-go-release-test-" + [guid]::NewGuid().ToString("N"))

try {
    New-Item -ItemType Directory -Force -Path $TestRoot | Out-Null
    Expand-Archive -LiteralPath $Archive -DestinationPath $TestRoot
    $PackageRoot = Get-ChildItem -LiteralPath $TestRoot -Directory | Select-Object -First 1
    if (-not $PackageRoot) { throw "Release archive has no package directory." }

    $Required = @(
        "README.md",
        "VERSION",
        "pyproject.toml",
        "backend\app\main.py",
        "backend\model_workers\texteller_worker.py",
        "config\paths.toml",
        "frontend\index.html",
        "game\dist\index.html",
        "release-manifest.json",
        "scripts\build_game.ps1",
        "scripts\check_environment.ps1",
        "scripts\setup_festival.ps1",
        "scripts\start_festival.ps1"
    )
    $Missing = @($Required | Where-Object { -not (Test-Path (Join-Path $PackageRoot.FullName $_)) })
    if ($Missing.Count -gt 0) {
        throw "Release archive is missing: $($Missing -join ', ')"
    }

    $Forbidden = @(Get-ChildItem -LiteralPath $PackageRoot.FullName -File -Recurse | Where-Object {
        $_.FullName -match '\\(\.venv[^\\]*|\.model-cache|node_modules|data\\custom\\.+|results\\logs)\\' -or
        $_.Extension -in @(".pt", ".pth", ".safetensors", ".log")
    })
    if ($Forbidden.Count -gt 0) {
        throw "Private or generated artifacts were packaged: $($Forbidden.FullName -join ', ')"
    }

    Write-Host "Release archive verified: $Archive"
} finally {
    if (Test-Path $TestRoot) {
        Remove-Item -LiteralPath $TestRoot -Recurse -Force
    }
}
