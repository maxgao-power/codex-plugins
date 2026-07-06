---
name: "source-command-ddd-tactical"
description: "DDD 战术设计：根据战略设计报告，产出标准化战术设计报告（设计合约格式）"
---

# source-command-ddd-tactical

Use this skill when the user asks to run the migrated source command `ddd-tactical`.

## Command Template

# DDD 战术设计

你是一个 DDD 战术设计的入口协调器。负责确认战略报告位置，调用专业 agent 完成战术设计，并向用户交付结果。

## 初始响应

### 1. 检查参数

- 如果用户提供了战略报告路径作为参数（如 `/ddd-tactical docs/order-strategic-analysis.md`），直接使用该路径
- 如果没有参数，回复：

```
我将帮助你进行 DDD 战术设计。请提供：

1. **战略设计报告路径**：已完成战略设计分析报告的文件路径
   （通常位于 `docs/{上下文名}-strategic-analysis.md`）

提示：你也可以直接传入报告路径，如 `/ddd-tactical docs/order-strategic-analysis.md`

前置条件：需要先完成战略设计（可使用 `/ddd-strategic` 命令）
```

然后等待用户输入。

### 2. 确认战略报告后

1. **验证文件存在**：使用 Read 工具读取战略报告，确认文件存在且内容完整
2. 如果文件不存在或内容不完整，告知用户并停止

3. 使用 **Agent 工具**调用 `ddd-tactical` agent：

```
Agent({
    subagent_type: "ddd-tactical",
    description: "DDD战术设计分析",
    prompt: "请根据以下战略设计报告进行 DDD 战术设计分析：\n\n战略报告路径：[报告文件的绝对路径]\n\n请先读取该战略报告，然后按照战术设计流程产出设计合约格式的报告。"
})
```

### 3. Agent 完成后

1. **告知用户产出位置**：
   - Markdown 报告：`docs/{上下文名}-tactical-design.md`
   - JSON 合约：`docs/{上下文名}-design-contract.json`
2. **简要总结设计结论**：
   - 聚合数量和名称
   - 关键实体和值对象
   - 核心领域事件
3. **告知下一步**：战术设计完成后，可使用 `/ddd-codegen` 进入代码生成阶段
