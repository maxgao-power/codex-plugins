. "$PSScriptRoot\_common.ps1"

$dashboardDir = Get-DashboardDir
$node = Get-NodeExe
$collector = Join-Path $dashboardDir "collector.mjs"

Start-Process -FilePath $node -ArgumentList @($collector, "unlock", "--quiet") -Wait -WindowStyle Hidden

Write-Output "Codex usage monitor switched to automatic mode."
