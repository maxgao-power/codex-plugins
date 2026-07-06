# codex-plugins

This repository is a Codex plugin marketplace for team-maintained plugins.

## Marketplace

- Marketplace name: `codex-plugins`
- Marketplace display name: `Codex Plugins`
- Plugin entries are declared in `.agents/plugins/marketplace.json`.
- Plugin packages live under `plugins/<plugin-name>/`.

## Plugins

- `codex-fullstack-delivery`: contract-first full-stack delivery workflow that coordinates frontend, backend, and test agents.

## Install The Marketplace

Team members can add this repository as a Codex plugin marketplace:

```bash
codex plugin marketplace add maxgao-power/codex-plugins --ref main
```

For SSH/private repositories:

```bash
codex plugin marketplace add git@github.com:maxgao-power/codex-plugins.git --ref main
```

Then open the plugin directory:

```text
codex
/plugins
```

Select `Codex Plugins`, then install the plugin you need.

## Install The Current Plugin

```bash
codex plugin add codex-fullstack-delivery@codex-plugins
```

## Update Local Marketplace Snapshot

When this repository changes, team members can refresh their local marketplace snapshot and reinstall the plugin:

```bash
codex plugin marketplace upgrade codex-plugins
codex plugin add codex-fullstack-delivery@codex-plugins
```

Start a new Codex thread after reinstalling so updated skills and tools are loaded.


## Migration From The Old Marketplace Name

If you previously added this repository when it was named `codex-fullstack-delivery`, remove the old marketplace entry and add the new one:

```bash
codex plugin marketplace remove codex-fullstack-delivery
codex plugin marketplace add maxgao-power/codex-plugins --ref main
codex plugin add codex-fullstack-delivery@codex-plugins
```

Start a new Codex thread after reinstalling.

## Use The Current Plugin

```text
@codex-fullstack-delivery 使用 fullstack-agent-team 开发这个全栈功能，协调后端、前端和测试 Agent 完成契约优先交付。
```

## Add A New Plugin

1. Create `plugins/<new-plugin-name>/.codex-plugin/plugin.json`.
2. Put bundled skills under `plugins/<new-plugin-name>/skills/`.
3. Add a new entry to `.agents/plugins/marketplace.json`.
4. Validate the plugin.
5. Commit and push.

See `docs/ADDING_PLUGIN.md` for the detailed checklist.


