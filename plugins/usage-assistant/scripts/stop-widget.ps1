. "$PSScriptRoot\_common.ps1"

$usageDir = Get-UsageDataDir
$pidFile = Join-Path $usageDir "widget.pid"

if (-not (Test-Path -LiteralPath $pidFile)) {
  Write-Output "AI usage assistant floating widget is not running."
  return
}

$pidText = (Get-Content -Raw -LiteralPath $pidFile).Trim()
if ($pidText -match "^\d+$") {
  Stop-Process -Id ([int] $pidText) -ErrorAction SilentlyContinue
}

Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
Write-Output "AI usage assistant floating widget stopped."
