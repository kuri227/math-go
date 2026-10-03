$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$GameRoot = Join-Path $RepoRoot "game"

Push-Location $GameRoot
try {
    pnpm install --frozen-lockfile
    pnpm build
} finally {
    Pop-Location
}

