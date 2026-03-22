# ================================================
#  Clipboard Sync - One-click launcher (Windows)
#  Double-click or run this script to start
# ================================================

Set-Location $PSScriptRoot

Write-Host ""
Write-Host "========================================="
Write-Host "  Clipboard Sync - Starting..."
Write-Host "========================================="
Write-Host ""

# Check Node.js
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "Node.js not found. Please install it first." -ForegroundColor Red
    Write-Host ""
    Write-Host "Download from: https://nodejs.org"
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Node.js $(node -v)" -ForegroundColor Green

# Check ws dependency
if (-not (Test-Path "node_modules\ws")) {
    Write-Host "First run - installing dependencies..."
    npm install --silent 2>$null
    Write-Host "Dependencies installed" -ForegroundColor Green
}

Write-Host ""

# Start the service (default port 9898)
# Usage: .\start-clipboard-sync.ps1 [port] [--ip x.x.x.x]
node clipboard-sync.mjs @args

# If stopped
Write-Host ""
Read-Host "Service stopped. Press Enter to exit"
