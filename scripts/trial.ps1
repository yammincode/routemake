# =====================================================================
# 原岩路線：在這台電腦跑「試用版」
# 用法（在 routemake 資料夾裡的 PowerShell 執行）：
#   powershell -ExecutionPolicy Bypass -File scripts\trial.ps1
# 會做的事：下載最新程式 → 安裝套件 → 啟動試用版（電腦與同一個 Wi-Fi 的手機都能開）
# 停止試用版：在這個視窗按 Ctrl + C
# =====================================================================
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)
$branch = "claude/happy-goldberg-szmqwa"

function Need($cmd, $name, $install) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    Write-Host "找不到 $name，請先安裝：$install" -ForegroundColor Red
    exit 1
  }
}
Need git "Git" "winget install Git.Git"
Need node "Node.js" "winget install OpenJS.NodeJS.LTS"

Write-Host "`n[1/4] 下載最新程式（$branch）..." -ForegroundColor Cyan
git fetch origin $branch
git checkout $branch
git pull --ff-only origin $branch

Write-Host "`n[2/4] 檢查連線設定 .env.local ..." -ForegroundColor Cyan
if (-not (Test-Path ".env.local")) {
  $key = Read-Host "第一次使用：請貼上 Supabase 的 publishable key（sb_publishable_ 開頭）"
  $text = "NEXT_PUBLIC_SUPABASE_URL=https://ngvlymkevcqhlaphoost.supabase.co`nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$($key.Trim())`n"
  [IO.File]::WriteAllText((Join-Path (Get-Location) ".env.local"), $text, (New-Object Text.UTF8Encoding $false))
  Write-Host "已建立 .env.local（只存在這台電腦，不會上傳）"
} else {
  Write-Host "已有 .env.local"
}

Write-Host "`n[3/4] 安裝套件（第一次比較久）..." -ForegroundColor Cyan
npm install --no-audit --no-fund

$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -match '^(192\.168|10\.|172\.)' -and $_.PrefixOrigin -ne 'WellKnown' } |
  Select-Object -First 1).IPAddress

Write-Host "`n[4/4] 啟動試用版" -ForegroundColor Cyan
Write-Host "  電腦打開：  http://localhost:3000" -ForegroundColor Green
if ($ip) { Write-Host "  手機打開：  http://${ip}:3000   （手機要連同一個 Wi-Fi）" -ForegroundColor Green }
Write-Host "  Windows 如果跳出防火牆詢問，請按「允許」"
Write-Host "  停止：按 Ctrl + C`n"
npm run trial
