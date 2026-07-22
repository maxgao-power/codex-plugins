. "$PSScriptRoot\_common.ps1"

$dashboardDir = Get-DashboardDir
$usageDir = Get-UsageDataDir
$node = Get-NodeExe
$collector = Join-Path $dashboardDir "collector.mjs"

& $node $collector "unlock" "--quiet" "--out" $usageDir

Write-Output "AI usage assistant switched to automatic mode."
