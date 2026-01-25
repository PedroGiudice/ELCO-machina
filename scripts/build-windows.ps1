# Build script para Windows com auto-update
# Execute no PowerShell como administrador se necessario

$ErrorActionPreference = "Stop"

Write-Host "=== Pro ATT Machine - Build Windows ===" -ForegroundColor Cyan

# Verificar se a chave de assinatura existe
$keyPath = "$env:USERPROFILE\.tauri\elco-machina.key"
if (-not (Test-Path $keyPath)) {
    Write-Host "Erro: Chave de assinatura nao encontrada em $keyPath" -ForegroundColor Red
    Write-Host "Gere uma com: bunx tauri signer generate -w $keyPath --ci"
    exit 1
}

# Exportar variaveis de ambiente para assinatura
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $keyPath -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""

# Instalar dependencias
Write-Host "Instalando dependencias..." -ForegroundColor Yellow
bun install

# Build
Write-Host "Gerando build..." -ForegroundColor Yellow
bun run tauri build

# Listar artefatos
Write-Host ""
Write-Host "=== Artefatos gerados ===" -ForegroundColor Green

$msiPath = "src-tauri\target\release\bundle\msi"
$nsisPath = "src-tauri\target\release\bundle\nsis"

if (Test-Path $msiPath) {
    Get-ChildItem $msiPath -Filter "*.msi" | ForEach-Object { Write-Host $_.FullName }
}

if (Test-Path $nsisPath) {
    Get-ChildItem $nsisPath -Filter "*.exe" | ForEach-Object { Write-Host $_.FullName }
}

Write-Host ""
Write-Host "Build concluido!" -ForegroundColor Green
