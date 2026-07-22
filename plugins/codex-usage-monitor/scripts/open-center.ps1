. "$PSScriptRoot\_common.ps1"

$dashboardDir = Get-DashboardDir
$center = Join-Path $dashboardDir "usage\usage-center.html"

if (-not (Test-Path -LiteralPath $center)) {
  $node = Get-NodeExe
  $collector = Join-Path $dashboardDir "collector.mjs"
  Start-Process -FilePath $node -ArgumentList @($collector, "scan", "--quiet") -Wait -WindowStyle Hidden
}

if (-not (Test-Path -LiteralPath $center)) {
  throw "Usage center was not found: $center"
}

Start-Process -FilePath $center
Write-Output "Codex usage center opened."
