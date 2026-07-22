param(
  [Parameter(Mandatory = $true)]
  [string] $SessionId
)

. "$PSScriptRoot\_common.ps1"

$dashboardDir = Get-DashboardDir
$node = Get-NodeExe
$collector = Join-Path $dashboardDir "collector.mjs"

Start-Process -FilePath $node -ArgumentList @($collector, "lock", "--session", $SessionId, "--quiet") -Wait -WindowStyle Hidden

Write-Output "Codex usage monitor locked to session: $SessionId"
