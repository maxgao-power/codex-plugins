$ErrorActionPreference = "Stop"

function Get-DashboardDir {
  if ($env:CODEX_USAGE_DASHBOARD_DIR -and (Test-Path -LiteralPath $env:CODEX_USAGE_DASHBOARD_DIR)) {
    return (Resolve-Path -LiteralPath $env:CODEX_USAGE_DASHBOARD_DIR).Path
  }

  $scriptDir = Split-Path -Parent $MyInvocation.ScriptName
  $pathFile = Join-Path $scriptDir "dashboard-path.txt"
  if (Test-Path -LiteralPath $pathFile) {
    $configured = (Get-Content -Raw -LiteralPath $pathFile).Trim()
    if ($configured -and (Test-Path -LiteralPath $configured)) {
      return (Resolve-Path -LiteralPath $configured).Path
    }
  }

  $candidate = Join-Path $scriptDir "..\..\.."
  $resolved = Resolve-Path -LiteralPath $candidate -ErrorAction SilentlyContinue
  if ($resolved -and (Test-Path -LiteralPath (Join-Path $resolved.Path "collector.mjs"))) {
    return $resolved.Path
  }

  throw "Codex usage dashboard was not found. Set CODEX_USAGE_DASHBOARD_DIR to the dashboard directory."
}

function Get-PowerShellExe {
  $candidate = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
  if (Test-Path -LiteralPath $candidate) {
    return $candidate
  }
  return "powershell.exe"
}

function Get-NodeExe {
  $candidate = "C:\nvm4w\nodejs\node.exe"
  if (Test-Path -LiteralPath $candidate) {
    return $candidate
  }
  $command = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }
  throw "node.exe was not found."
}
