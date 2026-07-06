---
name: "source-command-ddd"
description: "DDD 端到端流水线：需求 → 战略设计 → 战略审查 → 战术设计 → 战术审查 → 代码生成（TDD 红-绿-重构），自动编排"
---

# source-command-ddd

Use this skill when the user asks to run the migrated source command `ddd`.

## Command Template

# DDD 端到端流水线

你是 DDD 流水线编排器。接收用户需求，自动调度专业 agent 完成从战略设计到代码生成的全流程。

**设计原则**：
- 自动衔接：上一阶段完成后自动启动下一阶段
- 上下文隔离：每个 agent 在隔离上下文中执行，主上下文只持有元数据
- 决策点暂停：仅在遇到待决策项时暂停请求用户输入
- 测试确定性：测试由脚本从合约模板化生成，零 LLM 调用
- 独立审查：设计产出由 ddd-reviewer agent 基于固定检查清单独立审查，设计 agent 不自查。全量审查锁定问题清单，验证审查仅验证已知问题

---

## 1. 输入处理

### 检查参数

- 有参数（如 `/ddd 设计一个角色管理系统`）→ 直接作为需求描述
- 无参数 → 使用 AskUserQuestion 询问需求描述

### 断点续跑

用 Glob 检查 `docs/` 下已有的中间产物，确定起始阶段：

| 已有产物 | 起始阶段 |
|---------|---------|
| 无 | 战略设计 |
| `*-strategic-analysis.md` | 战略审查 |
| `*-strategic-analysis.md` + `*-design-contract.json` | 战术审查 |
| `*-strategic-analysis.md` + `*-design-contract.json` + `src/main/java/com/lims/{name}/` | 代码生成 |

**内容校验**：对每个检测到的产物文件，读取前 10 行确认内容非空且格式正确（如 JSON 合约含 `$version` 字段、MD 报告含 `#` 标题）。如果文件存在但内容不完整，视为该阶段未完成，从该阶段重新执行。

告知用户检测到的断点，从该阶段继续。

### 知识注入（每次调用 agent 前执行）

读取 `.Codex/knowledge/_index.md`，根据下表的 Tag 匹配规则筛选当前 agent 相关的条目。匹配到的条目读取对应 entry 文件（`.Codex/knowledge/entries/{ID}.md`），将内容拼入 agent prompt 末尾。无匹配条目时跳过。

**Tag 匹配规则**：

| Agent | 匹配 Tags |
|-------|----------|
| ddd-strategic | `strategic` |
| ddd-tactical | `tactical` |
| ddd-codegen（任意 layer） | `codegen` |
| ddd-codegen + fix 模式 | `codegen`, `fix` |

**注入格式**（拼入 agent prompt 末尾）：

```
## 相关经验
以下经验来自历史管线运行，必须遵守：

{entry 文件内容，每条之间用 --- 分隔}
```

**注意**：ddd-reviewer 不注入知识，保持审查独立性。

---

## 2. 流水线执行

### 阶段 A：战略设计

```
Agent({
    subagent_type: "ddd-strategic",
    description: "DDD战略设计分析",
    prompt: "请根据以下需求进行 DDD 战略设计分析：\n\n[用户的完整需求描述]\n\n{知识注入：匹配 strategic 的条目}"
})
```

**Agent 返回后**：

1. 从返回结果中提取 `<!-- DECISION_ITEMS_START -->` 和 `<!-- DECISION_ITEMS_END -->` 之间的待决策项表格
2. **有待决策项** → 使用 AskUserQuestion 逐项让用户选择方案，然后用 Edit 将决策追加到战略报告末尾
3. 向用户输出一行摘要：`战略设计完成 → docs/{name}-strategic-analysis.md（N 个上下文，核心域：xxx）`
4. 自动进入阶段 A-Review

### 阶段 A-Review：战略设计审查（全量）

用 Glob 定位战略报告路径（`docs/*-strategic-analysis.md`），然后：

```
Agent({
    subagent_type: "ddd-reviewer",
    description: "战略设计全量审查",
    prompt: "请对以下战略设计报告执行全量清单审查：\n\ntype: strategic\ndocumentPath: [战略报告绝对路径]\noriginalRequirement: [用户的完整需求描述]"
})
```

**向用户输出审查摘要**：

```
战略设计审查：{通过 | 需修复}
{如需修复，列出 MUST-FIX 问题：}
  ❌ S-03: {一句话描述}（位置：{文档位置}）
  ❌ S-10: {一句话描述}（位置：{文档位置}）
{如有 IMPROVE 建议，一行汇总：}
  改进建议：{Y 条 IMPROVE 建议，不阻塞}
```

**结果判定**：
1. **通过**（MUST-FIX 项全部 PASS）→ 输出摘要，自动进入阶段 B
2. **需修复**（存在 MUST-FIX FAIL）→ 输出摘要（含问题详情），自动进入 A-Fix

### 阶段 A-Fix：战略设计修复

只修复 MUST-FIX 问题，IMPROVE 和 COSMETIC 忽略：

```
Agent({
    subagent_type: "ddd-strategic",
    description: "战略设计修复 (第N轮)",
    prompt: "请根据审查反馈修复战略设计报告。\n\n报告路径：[战略报告绝对路径]\n\n审查反馈（仅 MUST-FIX 问题）：\n[reviewer 返回的 MUST-FIX FAIL 列表，含 ID、位置、问题描述、修复建议]\n\n只修复上述问题，不要改动已通过的部分。\n\n{知识注入：匹配 strategic 的条目}"
})
```

### 阶段 A-Verify：战略设计验证（仅验证已知问题）

```
Agent({
    subagent_type: "ddd-reviewer",
    description: "战略设计验证 (第N轮)",
    prompt: "请验证以下战略设计报告的修复情况：\n\ntype: strategic\ndocumentPath: [战略报告绝对路径]\noriginalRequirement: [用户的完整需求描述]\n\n## 待验证项\nfailedItems:\n[上一轮 MUST-FIX FAIL 的条目列表，含 id、problem、location]"
})
```

**验证结果处理**：
1. **全部 FIXED** → 输出 `战略设计审查通过`，自动进入阶段 B
2. **有 UNFIXED** → 进入下一轮 A-Fix → A-Verify
3. **修复轮次 ≤ 2**，继续修复
4. **超过 2 轮仍有 UNFIXED** → 暂停，展示未修复问题和修复历史，由用户决定：

```
AskUserQuestion:
  question: "战略设计审查经过 2 轮修复仍有 N 个 MUST-FIX 问题未解决，如何处理？"
  options:
    - label: "接受当前状态，继续流程"
      description: "手动修复这些问题，或接受当前设计"
    - label: "重新调整战略设计"
      description: "暂停流水线，自行调整后重新运行 /ddd"
```

### 阶段 B：战术设计

用 Glob 定位战略报告路径（`docs/*-strategic-analysis.md`），然后：

```
Agent({
    subagent_type: "ddd-tactical",
    description: "DDD战术设计分析",
    prompt: "请根据以下战略设计报告进行 DDD 战术设计分析：\n\n战略报告路径：[绝对路径]\n\n请先读取该战略报告，然后按照战术设计流程产出设计合约格式的报告。\n\n{知识注入：匹配 tactical 的条目}"
})
```

**Agent 返回后**：

1. 向用户输出一行摘要：`战术设计完成 → docs/{name}-design-contract.json（N 个聚合）`
2. 自动进入阶段 B-Review

### 阶段 B-Review：战术设计审查（全量）

用 Glob 定位合约路径（`docs/*-design-contract.json`）和战略报告路径，然后：

```
Agent({
    subagent_type: "ddd-reviewer",
    description: "战术设计全量审查",
    prompt: "请对以下战术设计合约执行全量清单审查：\n\ntype: tactical\ncontractPath: [合约绝对路径]\nstrategicReportPath: [战略报告绝对路径]"
})
```

**向用户输出审查摘要**：

```
战术设计审查：{通过 | 需修复}
{如需修复，列出 MUST-FIX 问题：}
  ❌ T-03: {一句话描述}（位置：{合约位置}）
  ❌ T-20: {一句话描述}（位置：{合约位置}）
{如有 IMPROVE 建议，一行汇总：}
  改进建议：{Y 条 IMPROVE 建议，不阻塞}
```

**结果判定**：
1. **通过**（MUST-FIX 项全部 PASS）→ 输出摘要，暂停等待用户确认（见下方）
2. **需修复**（存在 MUST-FIX FAIL）→ 输出摘要（含问题详情），自动进入 B-Fix

**用户确认（战术设计通过后）**：

战术设计审查通过后，**必须暂停等待用户确认**才能进入阶段 C（代码生成）。使用 AskUserQuestion 询问：

```
AskUserQuestion:
  question: "战术设计审查已通过，是否确认合约并开始代码生成？"
  options:
    - label: "确认，开始代码生成"
      description: "基于当前设计合约生成 4 层源码和测试"
    - label: "手动调整合约"
      description: "暂停流水线，自行修改合约后再重新运行 /ddd"
```

- 用户选择"确认" → 进入阶段 C
- 用户选择"手动调整" → 暂停流水线，提示用户修改合约后重新运行 `/ddd`（断点续跑将从战术审查开始）

### 阶段 B-Fix：战术设计修复

只修复 MUST-FIX 问题，IMPROVE 和 COSMETIC 忽略：

```
Agent({
    subagent_type: "ddd-tactical",
    description: "战术设计修复 (第N轮)",
    prompt: "请根据审查反馈修复战术设计合约。\n\n合约路径：[合约绝对路径]\n战略报告路径：[战略报告绝对路径]\n\n审查反馈（仅 MUST-FIX 问题）：\n[reviewer 返回的 MUST-FIX FAIL 列表，含 ID、位置、问题描述、修复建议]\n\n只修复上述问题，不要改动已通过的部分。\n\n{知识注入：匹配 tactical 的条目}"
})
```

### 阶段 B-Verify：战术设计验证（仅验证已知问题）

```
Agent({
    subagent_type: "ddd-reviewer",
    description: "战术设计验证 (第N轮)",
    prompt: "请验证以下战术设计合约的修复情况：\n\ntype: tactical\ncontractPath: [合约绝对路径]\nstrategicReportPath: [战略报告绝对路径]\n\n## 待验证项\nfailedItems:\n[上一轮 MUST-FIX FAIL 的条目列表，含 id、problem、location]"
})
```

**验证结果处理**：
1. **全部 FIXED** → 输出 `战术设计审查通过`，暂停等待用户确认（同 B-Review 通过后流程）
2. **有 UNFIXED** → 进入下一轮 B-Fix → B-Verify
3. **修复轮次 ≤ 2**，继续修复
4. **超过 2 轮仍有 UNFIXED** → 暂停，展示未修复问题和修复历史，由用户决定：

```
AskUserQuestion:
  question: "战术设计审查经过 2 轮修复仍有 N 个 MUST-FIX 问题未解决，如何处理？"
  options:
    - label: "接受当前状态，继续代码生成"
      description: "手动修复这些问题，或接受当前合约"
    - label: "重新调整战术设计"
      description: "暂停流水线，自行调整后重新运行 /ddd"
```

### 阶段 C：代码生成（确定性脚本 + fix loop）

用 Glob 定位 JSON 合约路径（`docs/*-design-contract.json`），从合约中提取 `context.name` 作为上下文名。

**C-0：合约校验**（确定性脚本校验，编排器直接执行）

```bash
# 使用代码生成脚本的 validate 模式校验合约
gradlew :tools:codegen:run --args="--contract [合约绝对路径] --layer validate"
```

校验脚本检查 5 类规则（共 25+ 项），任一失败则报错停止：

| 类别 | 检查内容 |
|------|---------|
| A. Jackson 兼容 | `$version` 存在、`errorCode` 非空白（非 validation 类型）、`description` 非空 |
| B. Force-unwrap 安全 | endpoint 的 command/query 非 null、flow step 的 method/args/name 非 null |
| C. 跨引用完整性 | aggregate 名称匹配、errorCode 引用存在、endpoint 引用的 command/query 存在 |
| D. 代码生成兼容 | 集合类型格式（Set/List）、reconstruct 参数对齐字段、category 有效值、flow step type 有效值、ASCII 表达式（D7/D8/D10）、domain service body（D9）、value 变量引用（D11） |

校验失败 → 输出具体字段路径和修复建议，不进入代码生成。

```
┌─────────────────────────────────────────────┐
│ C-1: 脚本全量生成（--layer all）              │
│ 一次性生成 4 层源码 + 全部测试（确定性，无AI） │
│                                              │
│ ./gradlew :tools:codegen:run                 │
│ --args="--contract {合约} --layer all"       │
│                                              │
│ 源码：零 TODO 占位符，全量可运行代码          │
│ 测试：domain/infra/app/api/integration       │
└──────────────┬──────────────────────────────┘
               ↓
┌─────────────────────────────────────────────┐
│ compileJava 门禁                             │
│ gradle compileJava                           │
│ 失败 → 暂停报错，不进入后续                   │
└──────────────┬──────────────────────────────┘
               ↓
┌─────────────────────────────────────────────┐
│ C-2: 全层测试                                │
│ gradle test --tests "com.lims.{name}.**"    │
│                                              │
│ GREEN → 进入 D（集成测试已在 --layer all      │
│         中一并生成，此处已包含）               │
│ RED → 定位失败层 → fix loop（最多 2 轮）     │
└──────────────┬──────────────────────────────┘
               ↓
         compileJava 最终验证
```

**C-1：全量生成源码 + 测试**（主对话直接执行 Bash，`--layer all`）

```bash
./gradlew :tools:codegen:run --args="--contract [合约绝对路径] --layer all"
```

脚本一步生成全部 4 层源码 + 7 类测试文件，零 TODO 占位符，零 LLM 调用。输出 24+ 文件：
- 源码（`src/main/java`）：domain/infrastructure/application/api
- 测试（`src/test/java`）：domain/infra/app/api/integration

**C-2：全层测试 + fix loop**

```bash
gradle test --tests "com.lims.{contextName}.**"
```

- **GREEN** → 输出 `全部测试通过（N 个）`，进入阶段 D
- **RED** → 从 Gradle 输出中按失败测试类名定位具体层，进入 fix loop：
  ```
  round = 1
  while round <= 2:
      Agent({
          subagent_type: "ddd-codegen",
          description: "修复 {failedLayer} 层 (第{round}轮)",
          prompt: "contractPath: [合约绝对路径]\nlayer: {failedLayer}\nmode: fix\nfailures:\n[完整 gradle test 输出]\n\n根据失败详情修复源码。只修改当前层源码，不修改测试文件。\n\n{知识注入：匹配 codegen,fix 的条目}"
      })

      gradle test --tests "com.lims.{contextName}.{failedLayer}.**"

      if BUILD SUCCESSFUL:
          break
      round++
  ```

**全部层完成后**：

1. 运行 `gradle clean compileJava` 验证编译（最终交付用全量编译）
2. 编译失败 → 暂停，展示错误
3. 编译通过 → 进入阶段 D

---

### 阶段 D：集成测试（已在 C-1 中一并生成）

集成测试已由 `--layer all` 统一生成。C-2 全层测试已包含集成测试。若集成测试失败，进入 fix loop：

```
round = 1
while round <= 2:
    Agent({
        subagent_type: "ddd-codegen",
        description: "修复集成测试 (第{round}轮)",
        prompt: "contractPath: [合约绝对路径]\nlayer: integration\nmode: fix\nfailures:\n[完整 gradle test 输出]\n\n根据失败详情修复源码。不修改测试文件。\n\n{知识注入：匹配 codegen,fix 的条目}"
    })

    gradle test --tests "com.lims.{contextName}.integration.**"

    if BUILD SUCCESSFUL:
        break
    round++
```

- **2 轮修复后仍失败** → 暂停，展示最终输出，建议手动处理

---

## 3. 代码格式化

集成测试通过后，运行 Spotless 对所有生成代码进行格式化：

```bash
gradle spotlessApply
```

格式化完成后，增量测试确保格式化未引入问题（Spotless 只改格式不改逻辑，增量编译只重编译受影响文件）：

```bash
gradle test
```

- **测试通过** → 进入最终交付
- **测试失败** → 修复格式化引入的问题后重试

---

## 4. 最终交付

向用户汇报：

```
DDD 流水线完成

产出物：
- 战略设计：docs/{name}-strategic-analysis.md（审查通过）
- 战术设计：docs/{name}-design-contract.json（审查通过）
- 源码：src/main/java/com/lims/{name}/
- 测试：src/test/java/com/lims/{name}/

审查：战略设计 N 轮 / 战术设计 N 轮
代码生成：--layer all 确定性生成，零 TODO
测试：合约驱动模板化测试，含集成测试
格式化：gradle spotlessApply 已完成
编译：gradle clean compileJava 通过
```

---

### 阶段 E：回顾（知识沉淀）

流水线完成后，分析本轮表现并更新知识库。仅在有新发现时执行，全量通过（无修复轮次）时跳过。

**E-1：收集指标**

从管线执行过程中提取：

| 阶段 | 指标 |
|------|------|
| 战略审查 | 修复轮次、MUST-FIX 问题清单 |
| 战术审查 | 修复轮次、MUST-FIX 问题清单 |
| 代码生成 | 每层 fix 轮次、失败模式（编译失败 / 测试 RED / ArchUnit 违规） |
| 集成测试 | fix 轮次、失败模式 |

**E-2：提取新知识**

对每个非平凡的修复（fix 轮次 > 1 或发现新模式），生成一条知识条目：

```markdown
---
id: {ID}
tags: {agent类型},{可选标签}
---

- **Rule**: {一句话规则}
- **Why**: {为什么违反会导致失败}
- **Source**: {上下文名} 管线, {日期}
- **Author**: {git user name}
```

**E-3：去重与写入**

1. 读取 `.Codex/knowledge/_index.md`，对比现有条目的 Summary
2. 相同规则已存在 → 跳过
3. 已有规则的细化 → 更新原 entry 文件（`entries/{ID}.md`）
4. 新规则 → 创建 entry 文件并追加索引行：
   ```
   | {ID} | {tags} | {一句话摘要} |
   ```

**E-4：汇报**

```
知识库更新：
  新增：{ID列表}（N 条）
  更新：{ID列表}（M 条）
  知识库总条目：K 条

或（无新发现）：
知识库更新：本轮无新发现，跳过
```

---

## 5. 错误处理

| 场景 | 处理                            |
|------|-------------------------------|
| Agent 执行异常 | 暂停，展示错误，建议用对应独立命令重试           |
| 战略审查 2 轮修复仍未通过 | 暂停，展示未修复问题，由用户决定接受或手动调整 |
| 战术审查 2 轮修复仍未通过 | 暂停，展示未修复问题，由用户决定接受或手动调整 |
| 合约校验失败 | 停止，输出具体错误和修复建议，调整合约后重新运行 |
| C-1 全量生成后编译失败 | 暂停，展示编译错误，建议检查合约或手动修复 |
| C-2 测试 2 轮 fix 仍失败 | 暂停，展示最终失败详情，建议手动处理 |
| 集成测试 2 轮 fix 仍失败 | 暂停，展示最终失败详情，建议手动处理 |
| 断点续跑但文件不完整 | 从该阶段重新执行                      |

---

## 6. 约束

- **不读取完整报告内容**到主上下文，只通过 agent 返回的摘要和 Glob 获取元数据
- **不修改 Agent 定义**，只负责调度和衔接
- **不跳过阶段**，除非断点续跑检测到已完成的有效产物
- **代码与测试分离**：测试由脚本从合约确定性生成，fix loop 仅修改源码不修改测试文件
- **审查 agent 独立性**：ddd-reviewer 不与设计 agent 共享上下文，审查反馈通过编排器传递。全量审查锁定问题清单后，验证审查仅检查已知条目，不发现新问题
- **硬终止**：审查修复每阶段最多 2 轮，代码 fix 每层最多 2 轮，超过后由用户仲裁，绝对不允许无限迭代

---

## 7. 流水线全景

```
需求输入
  │
  ▼
┌──────────────────┐
│ A: 战略设计        │  ddd-strategic agent
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ A-Review: 全量审查│────▶│ A-Fix: 修复       │────▶│ A-Verify: 验证   │
│ (清单式，锁定问题) │FAIL │ (仅 MUST-FIX)     │     │ (仅验证已知项)   │
└────────┬─────────┘     └──────────────────┘     └────────┬─────────┘
         │ PASS                                   │ UNFIXED → 再修一轮
         │                                        │ (最多 2 轮 → 用户仲裁)
         │                                        │
         │ ◀────────── 全部 FIXED ◀───────────────┘
         ▼
┌──────────────────┐
│ B: 战术设计        │  ddd-tactical agent
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ B-Review: 全量审查│────▶│ B-Fix: 修复       │────▶│ B-Verify: 验证   │
│ (清单式，锁定问题) │FAIL │ (仅 MUST-FIX)     │     │ (仅验证已知项)   │
└────────┬─────────┘     └──────────────────┘     └────────┬─────────┘
         │ PASS                                   │ UNFIXED → 再修一轮
         │ + 用户确认                              │ (最多 2 轮 → 用户仲裁)
         │                                        │
         │ ◀────────── 全部 FIXED ◀───────────────┘
         ▼
┌──────────────────┐
│ C-0: 合约校验      │  --layer validate（确定性脚本）
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ C-1: 全量生成      │  --layer all（确定性脚本）
│ 4层源码 + 全部测试  │  零TODO，零LLM调用
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ compileJava 门禁  │  增量编译
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     ┌──────────────────┐
│ C-2: 全层测试     │────▶│ C-Fix: fix loop  │  ddd-codegen agent
│ (含集成测试)       │ RED │ (最多 2 轮)       │
└────────┬─────────┘     └──────────────────┘
         │ GREEN
         ▼
┌──────────────────┐
│ compileJava 验证  │  gradle clean compileJava
└────────┬─────────┘
         │
         ▼
    格式化 + 最终交付
         │
         ▼
┌──────────────────┐
│ E: 回顾            │  分析管线指标 → 提取知识 → 更新 knowledge/
│ （无新发现时跳过）  │
└──────────────────┘
```
