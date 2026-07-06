# Adding A Plugin

Use this checklist when adding a new Codex plugin to this marketplace repository.

## Directory Layout

Create one directory per plugin:

```text
plugins/
└── <plugin-name>/
    ├── .codex-plugin/
    │   └── plugin.json
    └── skills/
        └── <skill-name>/
            └── SKILL.md
```

Optional plugin files such as `.mcp.json`, `.app.json`, `assets/`, `scripts/`, and additional references can live inside the plugin directory when needed.

## Plugin Manifest

The plugin folder name and `.codex-plugin/plugin.json` `name` must match exactly.

Minimum shape:

```json
{
  "name": "<plugin-name>",
  "version": "0.1.0",
  "description": "Short plugin description.",
  "author": {
    "name": "Team Name"
  },
  "skills": "./skills/",
  "interface": {
    "displayName": "Plugin Display Name",
    "shortDescription": "Short user-facing summary.",
    "longDescription": "Longer user-facing description.",
    "developerName": "Team Name",
    "category": "Productivity",
    "capabilities": ["Interactive", "Read", "Write"],
    "defaultPrompt": ["Use this plugin for ..."]
  }
}
```

## Marketplace Entry

Append a new entry to `.agents/plugins/marketplace.json`:

```json
{
  "name": "<plugin-name>",
  "source": {
    "source": "local",
    "path": "./plugins/<plugin-name>"
  },
  "policy": {
    "installation": "AVAILABLE",
    "authentication": "ON_INSTALL"
  },
  "category": "Productivity"
}
```

Keep existing entries in place unless intentionally reordering the marketplace.

## Validation

Run plugin validation before committing:

```powershell
python C:\Users\Administrator\.codex\skills\.system\plugin-creator\scripts\validate_plugin.py plugins\<plugin-name>
```

If you edited bundled skills, validate each skill too:

```powershell
$env:PYTHONUTF8='1'
python C:\Users\Administrator\.codex\skills\.system\skill-creator\scripts\quick_validate.py plugins\<plugin-name>\skills\<skill-name>
```

## Release

Commit and push:

```bash
git add .
git commit -m "Add <plugin-name> plugin"
git push origin main
```

Team members then refresh the marketplace snapshot:

```bash
codex plugin marketplace upgrade codex-plugins
codex plugin add <plugin-name>@codex-plugins
```

Start a new Codex thread after installing or updating a plugin.
