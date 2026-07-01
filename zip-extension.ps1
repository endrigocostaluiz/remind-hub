# Script para compactar a extensão excluindo os arquivos do GitHub Pages/Docs
# Para rodar: abra o PowerShell na pasta do projeto e execute: .\zip-extension.ps1

$zipPath = ".\extension-lembretes.zip"

# Remover zip antigo se existir
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

# Lista de arquivos e pastas essenciais da extensão
$includeItems = @(
    "manifest.json",
    "background.js",
    "content.js",
    "rules.json",
    "index.html",
    "pip-frame.html",
    "pip-frame.js",
    "js",
    "icons"
)

# Filtrar itens existentes
$filesToZip = Get-ChildItem -Path . | Where-Object { $_.Name -in $includeItems }

Write-Host "Compactando os seguintes arquivos da extensão..." -ForegroundColor Green
foreach ($item in $filesToZip) {
    Write-Host " -> $($item.Name)" -ForegroundColor Cyan
}

# Criar o arquivo ZIP limpo
Compress-Archive -Path $filesToZip.FullName -DestinationPath $zipPath -Force

Write-Host "Pronto! O arquivo $zipPath foi gerado com sucesso e contém apenas os arquivos necessários para a Chrome Web Store." -ForegroundColor Green
