param(
    [string]$Python = "python",
    [ValidateSet("tiny", "small", "base")]
    [string]$UniMERNetVariant = "tiny"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot

& $Python -m venv (Join-Path $RepoRoot ".venv")
& (Join-Path $RepoRoot ".venv\Scripts\python.exe") -m pip install -e "${RepoRoot}[benchmark,test]"

& $Python -m venv (Join-Path $RepoRoot ".venv-texteller")
& (Join-Path $RepoRoot ".venv-texteller\Scripts\python.exe") -m pip install --upgrade pip
& (Join-Path $RepoRoot ".venv-texteller\Scripts\python.exe") -m pip install texteller
& (Join-Path $RepoRoot ".venv-texteller\Scripts\python.exe") -m pip install --force-reinstall torch==2.14.0+cu132 torchvision==0.29.0+cu132 --index-url https://download.pytorch.org/whl/cu132
$TexTellerModel = Join-Path $RepoRoot ".model-cache\texteller"
& (Join-Path $RepoRoot ".venv-texteller\Scripts\python.exe") -c "from huggingface_hub import snapshot_download; snapshot_download(repo_id='OleehyO/TexTeller', local_dir=r'$TexTellerModel', allow_patterns=['config.json','generation_config.json','model.safetensors','added_tokens.json','merges.txt','special_tokens_map.json','tokenizer.json','tokenizer_config.json','vocab.json'], max_workers=1)"

$ThirdParty = Join-Path $RepoRoot "third_party"
New-Item -ItemType Directory -Force -Path $ThirdParty | Out-Null
$UniMERRepo = Join-Path $ThirdParty "UniMERNet"
if (-not (Test-Path $UniMERRepo)) {
    git clone https://github.com/opendatalab/UniMERNet.git $UniMERRepo
}
& $Python -m venv (Join-Path $RepoRoot ".venv-unimernet")
$UniPython = Join-Path $RepoRoot ".venv-unimernet\Scripts\python.exe"
& $UniPython -m pip install --upgrade pip
& $UniPython -m pip install torch==2.14.0+cu132 torchvision==0.29.0+cu132 --index-url https://download.pytorch.org/whl/cu132
& $UniPython -m pip install -e $UniMERRepo huggingface_hub
& $UniPython -c "from huggingface_hub import snapshot_download; snapshot_download(repo_id='wanderkid/unimernet_$UniMERNetVariant', local_dir=r'$UniMERRepo\models\unimernet_$UniMERNetVariant', max_workers=1)"

Write-Host "Model environments are ready."
