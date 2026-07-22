. "$PSScriptRoot\_common.ps1"

$dashboardDir = Get-DashboardDir
$usageDir = Get-UsageDataDir
$center = Join-Path $usageDir "usage-center.html"

if (-not (Test-Path -LiteralPath $center)) {
  $node = Get-NodeExe
  $collector = Join-Path $dashboardDir "collector.mjs"
  & $node $collector "scan" "--quiet" "--out" $usageDir
}

if (-not (Test-Path -LiteralPath $center)) {
  throw "Usage center was not found: $center"
}

Start-Process -FilePath $center
Write-Output "AI usage center opened."
