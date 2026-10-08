$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$GameRoot = Join-Path $RepoRoot "game"

Push-Location $GameRoot
try {
    pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw "pnpm install failed (exit $LASTEXITCODE)." }
    pnpm build
    if ($LASTEXITCODE -ne 0) { throw "Game build failed (exit $LASTEXITCODE)." }
} finally {
    Pop-Location
}

