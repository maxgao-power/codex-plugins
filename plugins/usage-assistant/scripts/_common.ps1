$ErrorActionPreference = "Stop"

$Script:UsageAssistantScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Get-PluginRoot {
  return (Resolve-Path -LiteralPath (Join-Path $Script:UsageAssistantScriptDir "..")).Path
}

function Get-DashboardDir {
  if ($env:CODEX_USAGE_DASHBOARD_DIR -and (Test-Path -LiteralPath $env:CODEX_USAGE_DASHBOARD_DIR)) {
    return (Resolve-Path -LiteralPath $env:CODEX_USAGE_DASHBOARD_DIR).Path
  }

  $pluginRoot = Get-PluginRoot
  $bundled = Join-Path $pluginRoot "dashboard"
  if (Test-Path -LiteralPath (Join-Path $bundled "collector.mjs")) {
    return (Resolve-Path -LiteralPath $bundled).Path
  }

  throw "Bundled usage dashboard was not found. Reinstall the AI usage assistant plugin."
}

function Get-UsageDataDir {
  if ($env:CODEX_USAGE_ASSISTANT_DATA_DIR) {
    $dir = $env:CODEX_USAGE_ASSISTANT_DATA_DIR
  } else {
    $base = $env:LOCALAPPDATA
    if (-not $base) {
      $base = Join-Path $env:USERPROFILE "AppData\Local"
    }
    $dir = Join-Path $base "AIUsageAssistant\usage"
  }

  if (-not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }

  return (Resolve-Path -LiteralPath $dir).Path
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
