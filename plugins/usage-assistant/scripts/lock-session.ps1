param(
  [Parameter(Mandatory = $true)]
  [string] $SessionId
)

. "$PSScriptRoot\_common.ps1"

$dashboardDir = Get-DashboardDir
$usageDir = Get-UsageDataDir
$node = Get-NodeExe
$collector = Join-Path $dashboardDir "collector.mjs"

& $node $collector "lock" "--session" $SessionId "--quiet" "--out" $usageDir

Write-Output "AI usage assistant locked to session: $SessionId"
