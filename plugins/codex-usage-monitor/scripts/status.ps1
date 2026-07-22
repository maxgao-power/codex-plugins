. "$PSScriptRoot\_common.ps1"

$dashboardDir = Get-DashboardDir
$node = Get-NodeExe
$collector = Join-Path $dashboardDir "collector.mjs"
$summary = Join-Path $dashboardDir "usage\latest-user-summary.json"

Start-Process -FilePath $node -ArgumentList @($collector, "scan", "--quiet") -Wait -WindowStyle Hidden

if (-not (Test-Path -LiteralPath $summary)) {
  throw "Usage summary was not found: $summary"
}

$json = Get-Content -Raw -Encoding UTF8 -LiteralPath $summary | ConvertFrom-Json
$active = $json.activeSession
$mode = "auto"
$requestedSession = ""
$effectiveSession = ""
$matched = $true
if ($active) {
  $mode = [string] $active.mode
  $requestedSession = [string] $active.requestedSessionId
  $effectiveSession = [string] $active.effectiveSessionId
  $matched = [bool] $active.matched
}

[pscustomobject]@{
  status = $json.statusLabel
  task = $json.taskTitle
  mode = $mode
  requested_session = $requestedSession
  effective_session = $effectiveSession
  matched = $matched
  context_usage = "{0:0.#}%" -f ([double] $json.contextUsageRate * 100)
  last_input = [int] $json.last.inputTokens
  last_new_input = [int] $json.last.uncachedInputTokens
  cache_hit = "{0:0.#}%" -f ([double] $json.last.cacheHitRate * 100)
  avg_input = [int] $json.total.avgInputTokens
} | ConvertTo-Json -Compress
