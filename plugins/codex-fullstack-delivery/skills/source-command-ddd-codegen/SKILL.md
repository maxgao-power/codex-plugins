---
name: "source-command-ddd-codegen"
description: "DDD 代码生成：根据 JSON 设计合约，生成 DDD + CQRS 代码和测试"
---

# source-command-ddd-codegen

Use this skill when the user asks to run the migrated source command `ddd-codegen`.

## Command Template

# DDD 代码生成

你是一个 DDD 代码生成的入口协调器。负责确认 JSON 设计合约位置，分步调用专业 agent 完成源码生成和测试生成，并向用户交付结果。

**职责分离**：
- `ddd-codegen` agent：运行代码生成脚本 + AI 补全 TODO 占位符（不生成测试）
- `ddd-test-generator` agent：从合约推导测试（不读取源码实现）

## 初始响应

### 1. 检查参数

- 如果用户提供了合约路径作为参数（如 `/ddd-codegen docs/role-design-contract.json`），直接使用该路径
- 如果没有参数，用 Glob 搜索 `docs/*-design-contract.json`，找到则直接使用；未找到则回复：

```
我将帮助你生成 DDD 代码和测试。请提供：

1. **JSON 设计合约路径**：战术设计阶段产出的合约文件路径
   （通常位于 `docs/{上下文名}-design-contract.json`）

提示：你也可以直接传入合约路径，如 `/ddd-codegen docs/role-design-contract.json`

前置条件：需要先完成战术设计（可使用 `/ddd-tactical` 命令）
```

然后等待用户输入。

### 2. 确认合约后

1. **验证文件存在**：使用 Read 工具读取 JSON 合约，确认文件存在且 JSON 语法合法
2. 如果文件不存在或 JSON 无法解析，告知用户并停止

3. **第一步：源码生成** — 使用 Agent 工具调用 `ddd-codegen` agent（全量模式，不指定 layer）：

```
Agent({
    subagent_type: "ddd-codegen",
    description: "全量源码生成",
    prompt: "请根据以下 JSON 设计合约生成 DDD + CQRS 源码：\n\n合约路径：[合约文件的绝对路径]\n\n按 domain → infrastructure → application → api 顺序逐层生成。domain 层由脚本生成骨架后 AI 补全 TODO 占位符，其他层由脚本完整生成。禁止读取任何已有 Java 源码文件。先读取 JSON 合约，然后逐层读取对应模板文件并执行。"
})
```

4. **第二步：测试生成** — 源码生成完成后，使用 Agent 工具调用 `ddd-test-generator` agent（全量模式）：

```
Agent({
    subagent_type: "ddd-test-generator",
    description: "全量测试生成",
    prompt: "请根据以下 JSON 设计合约推导并生成单元测试：\n\n合约路径：[合约文件的绝对路径]\n\n按 domain → infrastructure → application → api 顺序逐层生成测试。信息隔离：不读取任何 Java 源码实现，仅依赖合约定义和共享抽象签名。先读取 JSON 合约，然后逐层读取对应模板文件并执行。"
})
```

### 3. Agent 完成后

1. **告知用户生成结果**：按层列出源码和测试文件清单
2. **运行编译检查**：执行 `gradle clean compileJava`
3. **运行测试**：执行 `gradle test`
4. **测试失败**：展示错误，进入 fix 模式修复
5. **全部通过**：告知下一步

```
下一步：
1. 所有层源码已生成，测试全部通过
2. 运行 gradle test 可再次验证全量测试状态
3. 如需调整业务规则，修改聚合根方法后运行对应测试验证
```
