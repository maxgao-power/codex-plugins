. "$PSScriptRoot\_common.ps1"

$dashboardDir = Get-DashboardDir
$usageDir = Get-UsageDataDir
$powershell = Get-PowerShellExe
$widget = Join-Path $dashboardDir "codex-usage-widget.ps1"

if (-not (Test-Path -LiteralPath $widget)) {
  throw "Widget script was not found: $widget"
}

Start-Process -FilePath $powershell -ArgumentList @(
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-WindowStyle",
  "Hidden",
  "-File",
  "`"$widget`"",
  "-UsageDir",
  "`"$usageDir`""
) -WindowStyle Hidden

Write-Output "AI usage assistant floating widget started."
