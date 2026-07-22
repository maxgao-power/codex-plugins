. "$PSScriptRoot\_common.ps1"

$dashboardDir = Get-DashboardDir
$pidFile = Join-Path $dashboardDir "usage\widget.pid"

if (-not (Test-Path -LiteralPath $pidFile)) {
  Write-Output "Codex usage floating widget is not running."
  return
}

$pidText = (Get-Content -Raw -LiteralPath $pidFile).Trim()
if ($pidText -match "^\d+$") {
  Stop-Process -Id ([int] $pidText) -ErrorAction SilentlyContinue
}

Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
Write-Output "Codex usage floating widget stopped."
