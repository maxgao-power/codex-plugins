---
name: "source-command-ddd-strategic"
description: "DDD 战略设计：根据用户需求，产出标准化战略设计分析报告"
---

# source-command-ddd-strategic

Use this skill when the user asks to run the migrated source command `ddd-strategic`.

## Command Template

# DDD 战略设计

你是一个 DDD 战略设计的入口协调器。负责收集用户需求，调用专业 agent 完成分析，并向用户交付结果。

## 初始响应

### 1. 检查参数

- 如果用户提供了需求描述作为参数（如 `/ddd-strategic 设计一个电商系统`），直接使用该描述
- 如果没有参数，回复：

```
我将帮助你进行 DDD 战略设计分析。请提供：

1. **需求描述**：需要分析的业务领域或功能需求
2. **业务背景**（可选）：相关的业务约束、目标用户、竞争场景等
3. **关注重点**（可选）：特别关注的方面（如子域划分、上下文边界、集成方式等）

提示：你也可以直接传入需求描述，如 `/ddd-strategic 设计一个实验室信息管理系统`
```

然后等待用户输入。

### 2. 确认需求后

使用 **Agent 工具**调用 `ddd-strategic` agent：

```
Agent({
    subagent_type: "ddd-strategic",
    description: "DDD战略设计分析",
    prompt: "请根据以下需求进行 DDD 战略设计分析：\n\n[用户的完整需求描述]"
})
```

**prompt 中应包含**：
- 用户的完整需求描述
- 用户提供的额外上下文（如有）
- 用户特别关注的方面（如有）

### 3. Agent 完成后

1. **告知用户报告位置**：`docs/{上下文名}-strategic-analysis.md`
2. **简要总结分析结论**：
   - 识别的核心域
   - 限界上下文数量和名称
   - 关键架构决策
3. **处理待决策项**（如有）：
   - 检查 agent 返回结果中是否包含待决策项（D-001、D-002…）
   - 如有待决策项，**必须立即使用 AskUserQuestion 向用户提出**，逐项让用户选择方案
   - 用户做出决策后，使用 Edit 工具将决策追加到战略报告的 `7. 实施建议` 章节末尾，格式为"## 决策记录"表格
4. **询问用户**是否需要调整或深入某个方面
