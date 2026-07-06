# codex-fullstack-delivery

This repository publishes the `codex-fullstack-delivery` plugin for Codex.

## Plugins

- `codex-fullstack-delivery`: full-stack delivery workflow that coordinates frontend, backend, and test agents. Backend work must follow the bundled DDD pipeline.

## Included Skills

- `fullstack-agent-team`: coordinates frontend, backend, and test agents for contract-first full-stack delivery.
- `source-command-ddd`: end-to-end DDD pipeline from requirement to strategic design, tactical design, code generation, compile, test, and review.
- `source-command-ddd-strategic`: standalone DDD strategic design.
- `source-command-ddd-tactical`: standalone DDD tactical design and design contract generation.
- `source-command-ddd-codegen`: standalone DDD code generation from a JSON design contract.

## Install

Team members can add this repository as a Codex plugin marketplace:

```bash
codex plugin marketplace add maxgao-power/codex-fullstack-delivery --ref main
```

For SSH/private repositories:

```bash
codex plugin marketplace add git@github.com:maxgao-power/codex-fullstack-delivery.git --ref main
```

Then open the plugin directory:

```text
codex
/plugins
```

Select `Codex Fullstack Delivery`, then install `Codex Fullstack Delivery`.

## Usage

Start a new thread and ask Codex to use the plugin:

```text
@codex-fullstack-delivery 使用 fullstack-agent-team 开发这个全栈功能，后端遵循 DDD 流水线。
```

## Backend Project Requirements

The DDD pipeline expects the target backend project to provide the required project infrastructure, such as:

- Gradle wrapper or compatible Gradle commands.
- DDD code generation task, for example `:tools:codegen:run`.
- Contract documents under `docs/`.
- Project package and naming conventions.
- Test framework and compile/test commands.
- Optional `.Codex/knowledge` entries for historical pipeline lessons.

If a backend project does not provide the required infrastructure, the backend agent must report the missing prerequisites instead of bypassing the DDD pipeline.
