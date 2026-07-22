---
name: usage-assistant
description: Start, stop, or inspect the local AI usage assistant, including the floating widget, usage center, current context usage ratio, and latest input/output token summary. Use when the user asks to open, launch, start, close, stop, view, inspect, or check Codex usage, AI usage, token usage, context usage, or the usage widget.
---

# AI 用量助手

Use this skill when the user wants to manage the local AI usage assistant from Codex.

## Default Action

If the user invokes `@usage-assistant`, mentions the plugin name by itself, or asks to use/open the plugin without a subcommand, start the floating usage widget immediately. Keep the response brief and do not ask the user to choose a command.

## What It Can Do

- Start the floating usage widget.
- Stop the floating usage widget.
- Open the HTML usage center.
- Print the latest status summary.
- Lock the monitor to a specific Codex session, or switch back to automatic latest-session tracking.

The widget is a local Windows Forms process. It is not embedded inside the Codex desktop UI.

The plugin bundles its own dashboard runtime under `dashboard/`. It should not depend on a developer-machine absolute path. Runtime reports are written to a user data directory, not into the plugin source folder.

## Commands

Resolve the plugin root as the directory containing this skill's parent plugin, then run the scripts below from the plugin root.

Start the floating widget:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-widget.ps1
```

Stop the floating widget:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\stop-widget.ps1
```

Open the usage center:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\open-center.ps1
```

Print current status:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\status.ps1
```

Lock to a specific Codex session:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\lock-session.ps1 -SessionId <session-id>
```

Switch back to automatic mode:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\unlock-session.ps1
```

## Behavior

- If launching a GUI requires approval in the current Codex permission mode, request the scoped approval and explain that it opens the local usage widget.
- Do not start a web server.
- Do not ask the user to paste prompts or JSON.
- If the dashboard cannot be found, report the missing bundled dashboard and ask the user to reinstall the plugin.
- For ordinary users, prefer the floating widget. It shows the currently monitored session and includes a session dropdown in the widget plus a session picker in the tray menu.
- For debugging, use the usage center, status script, or explicit lock/unlock scripts.
