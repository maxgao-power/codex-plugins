#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_CODEX_HOME = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
const DEFAULT_OUT_DIR = path.join(__dirname, "usage");

function zeroUsage() {
  return {
    requests: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
    uncachedInputTokens: 0,
    inputOutputRatio: 0,
    cacheHitRate: 0,
    avgInputTokens: 0,
    avgUncachedInputTokens: 0,
    avgOutputTokens: 0
  };
}

function normalizeUsage(raw = {}) {
  const inputTokens = number(raw.input_tokens ?? raw.inputTokens);
  const cachedInputTokens = number(raw.cached_input_tokens ?? raw.cachedInputTokens);
  const cacheWriteInputTokens = number(raw.cache_write_input_tokens ?? raw.cacheWriteInputTokens);
  const outputTokens = number(raw.output_tokens ?? raw.outputTokens);
  const reasoningOutputTokens = number(raw.reasoning_output_tokens ?? raw.reasoningOutputTokens);
  const totalTokens = number(raw.total_tokens ?? raw.totalTokens) || inputTokens + outputTokens;
  const usage = {
    requests: 1,
    inputTokens,
    cachedInputTokens,
    cacheWriteInputTokens,
    outputTokens,
    reasoningOutputTokens,
    totalTokens,
    uncachedInputTokens: Math.max(0, inputTokens - cachedInputTokens)
  };
  return finalizeUsage(usage);
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function addUsage(left = zeroUsage(), right = zeroUsage()) {
  return finalizeUsage({
    requests: left.requests + right.requests,
    inputTokens: left.inputTokens + right.inputTokens,
    cachedInputTokens: left.cachedInputTokens + right.cachedInputTokens,
    cacheWriteInputTokens: left.cacheWriteInputTokens + right.cacheWriteInputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    reasoningOutputTokens: left.reasoningOutputTokens + right.reasoningOutputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
    uncachedInputTokens: left.uncachedInputTokens + right.uncachedInputTokens
  });
}

function finalizeUsage(usage) {
  usage.uncachedInputTokens = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  usage.inputOutputRatio = usage.outputTokens > 0 ? usage.inputTokens / usage.outputTokens : 0;
  usage.cacheHitRate = usage.inputTokens > 0 ? usage.cachedInputTokens / usage.inputTokens : 0;
  usage.avgInputTokens = usage.requests > 0 ? usage.inputTokens / usage.requests : 0;
  usage.avgUncachedInputTokens = usage.requests > 0 ? usage.uncachedInputTokens / usage.requests : 0;
  usage.avgOutputTokens = usage.requests > 0 ? usage.outputTokens / usage.requests : 0;
  return usage;
}

async function exists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listJsonlFiles(dir) {
  if (!(await exists(dir))) return [];
  const result = [];
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await listJsonlFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      result.push(fullPath);
    }
  }
  return result;
}

function parseJson(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function sourceLabel(source) {
  if (!source) return "";
  if (typeof source === "string") return source;
  if (source.subagent) return `subagent:${Object.values(source.subagent).join(",")}`;
  return Object.keys(source).join(",");
}

function sessionIdFromPath(filePath) {
  const base = path.basename(filePath, ".jsonl");
  const matches = base.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi);
  return matches?.at(-1) || base;
}

function pathKey(value) {
  if (!value) return "";
  try {
    return path.resolve(value).toLowerCase();
  } catch {
    return String(value).toLowerCase();
  }
}

async function readSessionIndex(codexHome) {
  const indexPath = path.join(codexHome, "session_index.jsonl");
  const titles = new Map();
  if (!(await exists(indexPath))) return titles;
  const content = await fsp.readFile(indexPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const event = parseJson(line);
    if (event?.id) titles.set(event.id, event.thread_name || "");
  }
  return titles;
}

async function parseSessionFile(filePath, titles = new Map()) {
  const stat = await fsp.stat(filePath);
  const content = await fsp.readFile(filePath, "utf8");
  const turns = [];
  const execTurns = [];
  const meta = {
    filePath,
    fileId: sessionIdFromPath(filePath),
    sessionId: null,
    rolloutId: null,
    parentThreadId: null,
    cwd: "",
    originator: "",
    cliVersion: "",
    source: "",
    threadSource: "",
    modelProvider: "",
    startedAt: null,
    updatedAt: stat.mtime.toISOString(),
    title: "",
    isSubagent: false
  };

  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const event = parseJson(line);
    if (!event) continue;

    if (event.type === "session_meta" && event.payload) {
      const payload = event.payload;
      meta.sessionId = payload.session_id || payload.sessionId || meta.sessionId;
      meta.rolloutId = payload.id || meta.rolloutId || meta.fileId;
      meta.parentThreadId = payload.parent_thread_id || payload.parentThreadId || null;
      meta.cwd = payload.cwd || "";
      meta.originator = payload.originator || "";
      meta.cliVersion = payload.cli_version || payload.cliVersion || "";
      meta.source = sourceLabel(payload.source);
      meta.threadSource = payload.thread_source || payload.threadSource || "";
      meta.modelProvider = payload.model_provider || payload.modelProvider || "";
      meta.startedAt = payload.timestamp || event.timestamp || meta.startedAt;
      meta.isSubagent = meta.threadSource === "subagent" || Boolean(payload.source?.subagent);
      continue;
    }

    if (event.type === "event_msg" && event.payload?.type === "token_count") {
      const info = event.payload.info || {};
      const usage = normalizeUsage(info.last_token_usage || info.lastTokenUsage || {});
      const totalUsage = normalizeUsage(info.total_token_usage || info.totalTokenUsage || {});
      totalUsage.requests = turns.length + 1;
      finalizeUsage(totalUsage);
      turns.push({
        at: event.timestamp || null,
        usage,
        totalUsage,
        modelContextWindow: number(info.model_context_window ?? info.modelContextWindow)
      });
      continue;
    }

    if (event.type === "turn.completed" && event.usage) {
      execTurns.push({
        at: event.timestamp || null,
        usage: normalizeUsage(event.usage)
      });
    }
  }

  meta.rolloutId ||= meta.fileId;
  meta.sessionId ||= meta.rolloutId;
  meta.title = titles.get(meta.sessionId) || titles.get(meta.rolloutId) || "";
  const usage = turns.length
    ? turns.at(-1).totalUsage
    : execTurns.reduce((total, turn) => addUsage(total, turn.usage), zeroUsage());
  if (!turns.length && execTurns.length) usage.requests = execTurns.length;
  finalizeUsage(usage);

  return {
    ...meta,
    usage,
    lastTurn: turns.at(-1) || execTurns.at(-1) || null,
    turns,
    eventCount: turns.length + execTurns.length
  };
}

function inWindow(value, start, end, toleranceMs = 5000) {
  if (!value || !end) return false;
  const time = new Date(value).getTime();
  const startTime = start ? new Date(start).getTime() - toleranceMs : 0;
  const endTime = new Date(end).getTime() + toleranceMs;
  return time >= startTime && time <= endTime;
}

function buildTaskView(main, sessions) {
  if (!main) return null;
  const childSessions = sessions
    .filter((session) => session.isSubagent && session.parentThreadId === main.sessionId)
    .sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));

  const previousMainTurn = main.turns.length > 1 ? main.turns.at(-2) : null;
  const lastMainTurn = main.lastTurn;
  const lastChildSessions = childSessions.filter((session) =>
    inWindow(session.lastTurn?.at || session.updatedAt, previousMainTurn?.at, lastMainTurn?.at)
  );

  let totalUsage = { ...main.usage };
  for (const child of childSessions) totalUsage = addUsage(totalUsage, child.usage);

  let lastTurnUsage = lastMainTurn?.usage ? { ...lastMainTurn.usage } : zeroUsage();
  for (const child of lastChildSessions) lastTurnUsage = addUsage(lastTurnUsage, child.usage);

  return {
    id: main.sessionId,
    title: main.title,
    cwd: main.cwd,
    source: main.source,
    startedAt: main.startedAt,
    updatedAt: main.updatedAt,
    filePath: main.filePath,
    childSessionCount: childSessions.length,
    lastTurnChildSessionCount: lastChildSessions.length,
    usage: totalUsage,
    mainUsage: main.usage,
    childUsage: childSessions.reduce((total, child) => addUsage(total, child.usage), zeroUsage()),
    lastTurn: lastMainTurn
      ? {
          at: lastMainTurn.at,
          modelContextWindow: lastMainTurn.modelContextWindow || 0,
          usage: lastTurnUsage,
          mainUsage: lastMainTurn.usage,
          childUsage: lastChildSessions.reduce((total, child) => addUsage(total, child.usage), zeroUsage())
        }
      : null
  };
}

function compactTurn(turn) {
  if (!turn) return null;
  return {
    at: turn.at,
    usage: turn.usage,
    totalUsage: turn.totalUsage,
    modelContextWindow: turn.modelContextWindow
  };
}

function compactSession(session) {
  return {
    filePath: session.filePath,
    fileId: session.fileId,
    sessionId: session.sessionId,
    rolloutId: session.rolloutId,
    parentThreadId: session.parentThreadId,
    cwd: session.cwd,
    originator: session.originator,
    cliVersion: session.cliVersion,
    source: session.source,
    threadSource: session.threadSource,
    modelProvider: session.modelProvider,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    title: session.title,
    isSubagent: session.isSubagent,
    usage: session.usage,
    lastTurn: compactTurn(session.lastTurn),
    eventCount: session.eventCount,
    error: session.error
  };
}

export async function collectUsage(options = {}) {
  const codexHome = options.codexHome || DEFAULT_CODEX_HOME;
  const activeSessionPath = options.activeSessionPath || activeSessionPathFor(options.outDir || DEFAULT_OUT_DIR);
  const activeSessionState = options.activeSession || (await readActiveSessionState(activeSessionPath));
  const titles = await readSessionIndex(codexHome);
  const sessionRoots = [path.join(codexHome, "sessions")];
  if (options.includeArchived) sessionRoots.push(path.join(codexHome, "archived_sessions"));

  const files = [];
  for (const root of sessionRoots) files.push(...(await listJsonlFiles(root)));

  const sessions = [];
  for (const file of files) {
    try {
      const session = await parseSessionFile(file, titles);
      if (session.eventCount > 0) sessions.push(session);
    } catch (error) {
      sessions.push({
        filePath: file,
        error: error.message,
        updatedAt: new Date(0).toISOString(),
        usage: zeroUsage(),
        isSubagent: false
      });
    }
  }

  sessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  const mainSessions = sessions.filter((session) => !session.isSubagent);
  const lockedSessionId = options.preferredSessionId || (activeSessionState.mode === "locked" ? activeSessionState.sessionId : "");
  const lockedMain = lockedSessionId
    ? mainSessions.find((session) => matchesSessionId(session, lockedSessionId))
    : null;
  const preferredCwd = options.preferredCwd ? pathKey(options.preferredCwd) : "";
  const preferredMainSessions = preferredCwd
    ? mainSessions.filter((session) => pathKey(session.cwd) === preferredCwd)
    : [];
  const latestMain = lockedMain || preferredMainSessions[0] || mainSessions[0] || sessions[0] || null;
  const latestTask = buildTaskView(latestMain, sessions);
  const seenTaskIds = new Set();
  const recentTaskCandidates = [];
  for (const main of mainSessions) {
    const task = buildTaskView(main, sessions);
    if (!task || seenTaskIds.has(task.id)) continue;
    seenTaskIds.add(task.id);
    recentTaskCandidates.push(task);
  }
  const recentTasks = latestTask
    ? [
        latestTask,
        ...recentTaskCandidates.filter((task) => task.id !== latestTask.id)
      ].slice(0, options.taskLimit || 20)
    : recentTaskCandidates.slice(0, options.taskLimit || 20);
  const allUsage = sessions.reduce((total, session) => addUsage(total, session.usage), zeroUsage());

  return {
    generatedAt: new Date().toISOString(),
    codexHome,
    preferredCwd: options.preferredCwd || "",
    activeSession: {
      mode: lockedSessionId ? "locked" : "auto",
      requestedSessionId: lockedSessionId || "",
      matched: lockedSessionId ? Boolean(lockedMain) : true,
      effectiveSessionId: latestTask?.id || "",
      taskTitle: latestTask ? displayTaskTitle(latestTask) : "",
      cwd: latestTask?.cwd || "",
      lockedAt: activeSessionState.lockedAt || "",
      updatedAt: activeSessionState.updatedAt || "",
      path: activeSessionPath
    },
    sessionCount: sessions.length,
    mainSessionCount: mainSessions.length,
    subagentSessionCount: sessions.length - mainSessions.length,
    latestTask,
    recentTasks,
    allUsage,
    sessions: sessions.slice(0, options.limit || 50).map(compactSession)
  };
}

function formatNumber(value) {
  return Math.round(value || 0).toLocaleString("en-US");
}

function formatPercent(value) {
  return `${((value || 0) * 100).toFixed(1)}%`;
}

function formatCompactNumber(value) {
  const numberValue = Math.round(value || 0);
  if (numberValue >= 1_000_000) return `${trimFixed(numberValue / 1_000_000)}M`;
  if (numberValue >= 1_000) return `${trimFixed(numberValue / 1_000)}k`;
  return String(numberValue);
}

function trimFixed(value) {
  return value.toFixed(1).replace(/\.0$/, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeFileName(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "unknown";
}

function activeSessionPathFor(outDir = DEFAULT_OUT_DIR) {
  return path.join(outDir, "active-session.json");
}

async function readActiveSessionState(activeSessionPath) {
  try {
    const raw = await fsp.readFile(activeSessionPath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed?.mode === "locked" && parsed.sessionId) {
      return {
        mode: "locked",
        sessionId: String(parsed.sessionId),
        lockedAt: parsed.lockedAt || "",
        updatedAt: parsed.updatedAt || ""
      };
    }
  } catch {
    // Missing or invalid lock state should fall back to automatic mode.
  }
  return { mode: "auto", sessionId: "", lockedAt: "", updatedAt: "" };
}

async function writeActiveSessionState(activeSessionPath, state) {
  await fsp.mkdir(path.dirname(activeSessionPath), { recursive: true });
  const updatedAt = new Date().toISOString();
  await fsp.writeFile(
    activeSessionPath,
    JSON.stringify({ mode: "auto", ...state, updatedAt }, null, 2),
    "utf8"
  );
}

function matchesSessionId(session, sessionId) {
  if (!session || !sessionId) return false;
  return [session.sessionId, session.rolloutId, session.fileId].filter(Boolean).includes(sessionId);
}

function quoteCmdArg(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function buildCollectorCommandFile(collectorArgs, outDir) {
  const centerPath = path.join(outDir, "usage-center.html");
  return [
    "@echo off",
    "setlocal",
    'set "NODE=C:\\nvm4w\\nodejs\\node.exe"',
    'if not exist "%NODE%" set "NODE=node.exe"',
    `"%NODE%" ${quoteCmdArg(__filename)} ${collectorArgs.map(quoteCmdArg).join(" ")} --out ${quoteCmdArg(outDir)} --quiet`,
    `start "" ${quoteCmdArg(centerPath)}`,
    "endlocal",
    ""
  ].join("\r\n");
}

function looksMojibake(value) {
  const text = String(value || "");
  if (!text) return false;
  if (text.includes("�")) return true;
  const markers = ["璇", "鐢", "锛", "濂", "浣", "鏄", "鍙", "湪", "堜", "闂", "绋", "涓", "屾", "熺"];
  const hits = markers.reduce((count, marker) => count + (text.includes(marker) ? 1 : 0), 0);
  return hits >= 2;
}

function displayTaskTitle(task) {
  const title = String(task?.title || "").trim();
  if (title && !looksMojibake(title)) return title;
  const cwdName = task?.cwd ? path.basename(task.cwd) : "";
  if (cwdName) return `当前任务：${cwdName}`;
  return task?.id || "当前 Codex 任务";
}

function usageLevel(summary) {
  const contextUsageRate = summary.contextUsageRate || 0;
  if (contextUsageRate > 0.7) {
    return { level: "danger", label: "务必新会话", tone: "上下文过满" };
  }
  if (contextUsageRate > 0.5) {
    return { level: "watch", label: "考虑新会话", tone: "上下文偏满" };
  }
  return { level: "great", label: "上下文健康", tone: "继续使用" };
}

function targetLabel(avgInputTokens) {
  if (avgInputTokens < 20_000) return "低于目标";
  if (avgInputTokens <= 40_000) return "已达标";
  if (avgInputTokens <= 80_000) return "略高于目标";
  return "明显高于目标";
}

function buildAdvice(summary) {
  const last = summary.last;
  const total = summary.total;
  const advice = [];

  if ((summary.contextUsageRate || 0) > 0.7) {
    advice.push("上下文已经超过 70%，务必创建新会话，只保留当前任务目标和关键文件。");
  } else if ((summary.contextUsageRate || 0) > 0.5) {
    advice.push("上下文已经超过 50%，建议考虑创建新会话，避免后续回答质量下降。");
  }

  if (total.avgInputTokens > 40_000) {
    advice.push(`每轮平均用量是 ${formatNumber(total.avgInputTokens)}，目标是 20,000-40,000。优先缩小工作目录、减少默认上下文，把大任务拆成短任务。`);
  }

  if (last.inputTokens > 80_000 && last.uncachedInputTokens <= 20_000 && last.cacheHitRate >= 0.8) {
    advice.push(`本轮总内容看起来多，但新内容只有 ${formatNumber(last.uncachedInputTokens)}，系统复用正在帮你省。`);
  }

  if (last.uncachedInputTokens > 40_000) {
    advice.push("本轮新增上下文偏多。下一轮只给关键文件、关键日志和明确目标，不要整段贴项目或长日志。");
  }

  if (total.cacheHitRate < 0.6) {
    advice.push("复用比例偏低。尽量在同一个任务里连续处理同一类问题，避免频繁切换项目、规则和大文件。");
  }

  if (summary.task.lastTurnChildSessionCount > 0) {
    advice.push(`本轮包含 ${summary.task.lastTurnChildSessionCount} 个子任务，统计已合并；减少自动审查或子任务可以降低请求次数。`);
  }

  if (!advice.length) {
    advice.push("当前没有明显异常。继续观察 5-10 轮平均值，再判断优化是否真的有效。");
  }

  return advice.slice(0, 3);
}

export function buildFriendlySummary(snapshot) {
  const task = snapshot.latestTask;
  if (!task) {
    return {
      hasTask: false,
      activeSession: snapshot.activeSession || { mode: "auto", matched: true },
      statusLabel: "暂无数据",
      headline: "还没有找到 Codex 用量记录。",
      primaryAdvice: "完成一轮 Codex 对话后会自动生成统计。"
    };
  }

  const last = task.lastTurn?.usage || zeroUsage();
  const total = task.usage || zeroUsage();
  const modelContextWindow = number(task.lastTurn?.modelContextWindow);
  const contextInputTokens = number(task.lastTurn?.mainUsage?.inputTokens) || last.inputTokens;
  const contextUsageRate = modelContextWindow > 0 ? contextInputTokens / modelContextWindow : 0;
  const summary = {
    hasTask: true,
    generatedAt: snapshot.generatedAt,
    activeSession: snapshot.activeSession || { mode: "auto", matched: true },
    task,
    taskTitle: displayTaskTitle(task),
    last,
    total,
    modelContextWindow,
    contextInputTokens,
    contextUsageRate,
    target: {
      avgInputMin: 20_000,
      avgInputMax: 40_000,
      label: targetLabel(total.avgInputTokens)
    }
  };
  const level = usageLevel(summary);
  const advice = buildAdvice(summary);

  return {
    ...summary,
    ...level,
    advice,
    primaryAdvice: advice[0],
    statusLabel: level.label,
    headline: `本轮新内容 ${formatCompactNumber(last.uncachedInputTokens)}，已节省 ${formatPercent(last.cacheHitRate)}；平均用量 ${formatCompactNumber(total.avgInputTokens)}，${summary.target.label}。`,
    notification: `本轮新内容 ${formatCompactNumber(last.uncachedInputTokens)} / 总内容 ${formatCompactNumber(last.inputTokens)} / 已节省 ${formatPercent(last.cacheHitRate)}。${advice[0] || ""}`
  };
}

function formatUsageLine(label, usage) {
  return [
    `${label}:`,
    `requests=${formatNumber(usage.requests)}`,
    `input=${formatNumber(usage.inputTokens)}`,
    `cached=${formatNumber(usage.cachedInputTokens)}`,
    `uncached=${formatNumber(usage.uncachedInputTokens)}`,
    `output=${formatNumber(usage.outputTokens)}`,
    `hit=${formatPercent(usage.cacheHitRate)}`,
    `avg_input=${formatNumber(usage.avgInputTokens)}`
  ].join(" ");
}

export function formatConsole(snapshot) {
  const task = snapshot.latestTask;
  if (!task) return "No Codex usage events found.";
  const friendly = buildFriendlySummary(snapshot);
  const lines = [
    `Codex 用量：${friendly.statusLabel}`,
    friendly.headline,
    `建议：${friendly.primaryAdvice}`,
    "",
    `Latest Codex task: ${friendly.taskTitle || task.id}`,
    `Updated: ${task.updatedAt}`,
    `CWD: ${task.cwd || "(unknown)"}`,
    formatUsageLine("Last turn", task.lastTurn?.usage || zeroUsage()),
    formatUsageLine("Task total", task.usage),
    `Child/subagent sessions included: ${task.childSessionCount}`
  ];
  return lines.join("\n");
}

export function formatFriendlyText(snapshot) {
  const friendly = buildFriendlySummary(snapshot);
  if (!friendly.hasTask) return `${friendly.headline}\n${friendly.primaryAdvice}\n`;
  return [
    `Codex 用量：${friendly.statusLabel}`,
    friendly.headline,
    "",
    "本轮",
    `- 对话容量已用：${formatPercent(friendly.contextUsageRate)}`,
    `- 本轮新内容：${formatNumber(friendly.last.uncachedInputTokens)}`,
    `- 本轮总内容：${formatNumber(friendly.last.inputTokens)}`,
    `- 已节省：${formatPercent(friendly.last.cacheHitRate)}`,
    `- 回答长度：${formatNumber(friendly.last.outputTokens)}`,
    "",
    "当前任务",
    `- 每轮平均用量：${formatNumber(friendly.total.avgInputTokens)}（目标 20,000-40,000，${friendly.target.label}）`,
    `- 每轮平均新内容：${formatNumber(friendly.total.avgUncachedInputTokens)}`,
    `- 累计用量：${formatNumber(friendly.total.inputTokens)}`,
    `- 累计新内容：${formatNumber(friendly.total.uncachedInputTokens)}`,
    "",
    "建议",
    ...friendly.advice.map((item) => `- ${item}`),
    ""
  ].join("\n");
}

export function formatMarkdown(snapshot) {
  const task = snapshot.latestTask;
  if (!task) return "# Codex Usage\n\nNo Codex usage events found.\n";
  const last = task.lastTurn?.usage || zeroUsage();
  return `# Codex Usage

Generated: ${snapshot.generatedAt}

## Latest Task

- Task: ${task.title || task.id}
- Updated: ${task.updatedAt}
- CWD: ${task.cwd || "(unknown)"}
- Session: ${task.id}
- Included child/subagent sessions: ${task.childSessionCount}

## Last Turn

| Metric | Value |
| --- | ---: |
| Requests | ${formatNumber(last.requests)} |
| Input tokens | ${formatNumber(last.inputTokens)} |
| Cached input tokens | ${formatNumber(last.cachedInputTokens)} |
| Uncached input tokens | ${formatNumber(last.uncachedInputTokens)} |
| Output tokens | ${formatNumber(last.outputTokens)} |
| Reasoning output tokens | ${formatNumber(last.reasoningOutputTokens)} |
| Cache hit rate | ${formatPercent(last.cacheHitRate)} |
| Input/output ratio | ${last.inputOutputRatio.toFixed(1)} |

## Task Total

| Metric | Value |
| --- | ---: |
| Requests | ${formatNumber(task.usage.requests)} |
| Input tokens | ${formatNumber(task.usage.inputTokens)} |
| Cached input tokens | ${formatNumber(task.usage.cachedInputTokens)} |
| Uncached input tokens | ${formatNumber(task.usage.uncachedInputTokens)} |
| Output tokens | ${formatNumber(task.usage.outputTokens)} |
| Reasoning output tokens | ${formatNumber(task.usage.reasoningOutputTokens)} |
| Cache hit rate | ${formatPercent(task.usage.cacheHitRate)} |
| Average input/request | ${formatNumber(task.usage.avgInputTokens)} |
| Average uncached input/request | ${formatNumber(task.usage.avgUncachedInputTokens)} |
`;
}

export function formatFriendlyMarkdown(snapshot) {
  const friendly = buildFriendlySummary(snapshot);
  if (!friendly.hasTask) return `# Codex 用量提醒\n\n${friendly.headline}\n\n${friendly.primaryAdvice}\n`;
  return `# Codex 用量提醒

生成时间：${snapshot.generatedAt}

## 一句话

**${friendly.statusLabel}**：${friendly.headline}

## 给用户看的结论

${friendly.primaryAdvice}

## 本轮

| 指标 | 数值 |
| --- | ---: |
| 对话容量已用 | ${formatPercent(friendly.contextUsageRate)} |
| 容量上限 | ${friendly.modelContextWindow ? formatNumber(friendly.modelContextWindow) : "未知"} |
| 本轮新内容 | ${formatNumber(friendly.last.uncachedInputTokens)} |
| 本轮总内容 | ${formatNumber(friendly.last.inputTokens)} |
| 已节省 | ${formatPercent(friendly.last.cacheHitRate)} |
| 回答长度 | ${formatNumber(friendly.last.outputTokens)} |
| 请求次数 | ${formatNumber(friendly.last.requests)} |

## 当前任务

| 指标 | 数值 |
| --- | ---: |
| 每轮平均用量 | ${formatNumber(friendly.total.avgInputTokens)} |
| 目标区间 | 20,000-40,000 |
| 目标判断 | ${friendly.target.label} |
| 每轮平均新内容 | ${formatNumber(friendly.total.avgUncachedInputTokens)} |
| 累计用量 | ${formatNumber(friendly.total.inputTokens)} |
| 累计新内容 | ${formatNumber(friendly.total.uncachedInputTokens)} |
| 任务已节省 | ${formatPercent(friendly.total.cacheHitRate)} |

## 建议

${friendly.advice.map((item) => `- ${item}`).join("\n")}
`;
}

function metricHtml(label, value, hint = "") {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(hint)}</small></div>`;
}

export function formatFriendlyHtml(snapshot) {
  const friendly = buildFriendlySummary(snapshot);
  const title = friendly.hasTask ? `Codex 用量：${friendly.statusLabel}` : "Codex 用量";
  const taskTitle = friendly.hasTask ? friendly.taskTitle : "暂无任务";
  const metrics = friendly.hasTask
    ? [
        metricHtml("对话容量已用", formatPercent(friendly.contextUsageRate), friendly.modelContextWindow ? `上限 ${formatNumber(friendly.modelContextWindow)}` : "等待下一轮数据"),
        metricHtml("本轮新内容", formatNumber(friendly.last.uncachedInputTokens), "这次真正新增的内容"),
        metricHtml("本轮总内容", formatNumber(friendly.last.inputTokens), "包含系统复用的内容"),
        metricHtml("已节省", formatPercent(friendly.last.cacheHitRate), "越高越省"),
        metricHtml("平均用量", formatNumber(friendly.total.avgInputTokens), "目标 20,000-40,000"),
        metricHtml("平均新内容", formatNumber(friendly.total.avgUncachedInputTokens), "越低越轻"),
        metricHtml("回答长度", formatNumber(friendly.last.outputTokens), "本轮回答")
      ].join("\n")
    : "";

  const advice = (friendly.advice || [friendly.primaryAdvice]).map((item) => `<li>${escapeHtml(item)}</li>`).join("\n");

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5f6f8;
        --panel: #ffffff;
        --ink: #17202a;
        --muted: #667085;
        --line: #d8dee8;
        --good: #117865;
        --ok: #2463a6;
        --watch: #9a5b13;
        --danger: #a43838;
        --soft: #edf2f7;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
        font-family: "Microsoft YaHei", "Segoe UI", system-ui, sans-serif;
      }
      main {
        width: min(980px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 28px 0 40px;
      }
      .hero {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 22px;
      }
      .eyebrow {
        color: var(--muted);
        font-size: 13px;
        margin-bottom: 8px;
      }
      h1 {
        margin: 0;
        font-size: 26px;
        line-height: 1.25;
        letter-spacing: 0;
      }
      .headline {
        margin: 12px 0 0;
        color: var(--muted);
        font-size: 16px;
        line-height: 1.6;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 5px 10px;
        margin-bottom: 14px;
        color: #fff;
        background: var(--ok);
        font-size: 13px;
        font-weight: 700;
      }
      .badge.great { background: var(--good); }
      .badge.ok { background: var(--ok); }
      .badge.watch { background: var(--watch); }
      .badge.danger { background: var(--danger); }
      .grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        margin-top: 16px;
      }
      .metric {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 15px;
        min-width: 0;
      }
      .metric span,
      .metric small {
        display: block;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.45;
      }
      .metric strong {
        display: block;
        margin: 5px 0;
        font-size: 24px;
        line-height: 1.2;
        word-break: break-word;
      }
      section {
        margin-top: 16px;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 18px;
      }
      h2 {
        margin: 0 0 12px;
        font-size: 16px;
      }
      ul {
        margin: 0;
        padding-left: 20px;
      }
      li {
        margin: 8px 0;
        line-height: 1.6;
      }
      .meta {
        display: grid;
        grid-template-columns: 120px 1fr;
        gap: 8px 14px;
        color: var(--muted);
        font-size: 13px;
      }
      .meta strong {
        color: var(--ink);
        font-weight: 650;
        word-break: break-word;
      }
      @media (max-width: 760px) {
        main { width: min(100vw - 22px, 980px); padding-top: 16px; }
        .grid { grid-template-columns: 1fr; }
        .meta { grid-template-columns: 1fr; }
        h1 { font-size: 22px; }
      }
    </style>
  </head>
  <body>
    <main>
      <div class="hero">
        <div class="badge ${escapeHtml(friendly.level || "ok")}">${escapeHtml(friendly.statusLabel)}</div>
        <div class="eyebrow">${escapeHtml(taskTitle)}</div>
        <h1>${escapeHtml(friendly.hasTask ? friendly.tone : "等待第一轮统计")}</h1>
        <p class="headline">${escapeHtml(friendly.headline)}</p>
      </div>
      <div class="grid">
        ${metrics}
      </div>
      <section>
        <h2>现在该怎么做</h2>
        <ul>
          ${advice}
        </ul>
      </section>
      <section>
        <h2>任务信息</h2>
        <div class="meta">
          <span>更新时间</span><strong>${escapeHtml(friendly.hasTask ? friendly.task.updatedAt : snapshot.generatedAt)}</strong>
          <span>工作目录</span><strong>${escapeHtml(friendly.hasTask ? friendly.task.cwd || "(unknown)" : "")}</strong>
          <span>子任务</span><strong>${escapeHtml(friendly.hasTask ? friendly.task.childSessionCount : 0)}</strong>
          <span>报告生成</span><strong>${escapeHtml(snapshot.generatedAt)}</strong>
        </div>
      </section>
    </main>
  </body>
</html>
`;
}

export function formatUsageCenterHtml(snapshot) {
  const tasks = snapshot.recentTasks?.length ? snapshot.recentTasks : snapshot.latestTask ? [snapshot.latestTask] : [];
  const active = snapshot.activeSession || { mode: "auto", matched: true };
  const activeLabel =
    active.mode === "locked"
      ? active.matched
        ? `悬浮窗已锁定：${displayTaskTitle(snapshot.latestTask)}`
        : `锁定的会话暂未找到：${active.requestedSessionId}`
      : "悬浮窗自动监控最新会话";
  const cards = tasks
    .map((task) => {
      const taskSnapshot = { ...snapshot, latestTask: task };
      const friendly = buildFriendlySummary(taskSnapshot);
      const taskDir = `tasks/${safeFileName(task.id)}`;
      const href = `${taskDir}/report.html`;
      const lockHref = `${taskDir}/lock-session.cmd`;
      const selected = active.mode === "locked" && active.matched && active.requestedSessionId === task.id;
      return `<article class="task ${selected ? "selected" : ""}">
        <div class="taskTop">
          <span class="badge ${escapeHtml(friendly.level || "ok")}">${escapeHtml(friendly.statusLabel)}</span>
          ${selected ? `<span class="selectedBadge">当前监控</span>` : ""}
        </div>
        <strong>${escapeHtml(friendly.taskTitle || task.id)}</strong>
        <span>${escapeHtml(friendly.headline)}</span>
        <small>${escapeHtml(task.cwd || "")}</small>
        <div class="actions">
          <a class="action" href="${escapeHtml(href)}">报告</a>
          <a class="action primary" href="${escapeHtml(lockHref)}">监控</a>
        </div>
      </article>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Codex 用量中心</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5f6f8;
        --panel: #ffffff;
        --ink: #17202a;
        --muted: #667085;
        --line: #d8dee8;
        --good: #117865;
        --ok: #2463a6;
        --watch: #9a5b13;
        --danger: #a43838;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
        font-family: "Microsoft YaHei", "Segoe UI", system-ui, sans-serif;
      }
      main {
        width: min(980px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 28px 0 40px;
      }
      header {
        margin-bottom: 16px;
      }
      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      h1 {
        margin: 0;
        font-size: 28px;
        line-height: 1.25;
        letter-spacing: 0;
      }
      .subtle {
        margin-top: 8px;
        color: var(--muted);
        font-size: 14px;
      }
      .list {
        display: grid;
        gap: 10px;
      }
      .task {
        display: grid;
        gap: 7px;
        padding: 16px;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 8px;
        color: inherit;
      }
      .task:hover {
        border-color: #9aa8ba;
      }
      .task.selected {
        border-color: #2463a6;
        box-shadow: 0 0 0 2px rgba(36, 99, 166, 0.08);
      }
      .taskTop {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .task strong {
        font-size: 17px;
        line-height: 1.35;
      }
      .task span,
      .task small {
        color: var(--muted);
        line-height: 1.55;
      }
      .task small {
        word-break: break-all;
      }
      .badge {
        justify-self: start;
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 4px 9px;
        color: #fff !important;
        background: var(--ok);
        font-size: 12px;
        font-weight: 700;
      }
      .badge.great { background: var(--good); }
      .badge.ok { background: var(--ok); }
      .badge.watch { background: var(--watch); }
      .badge.danger { background: var(--danger); }
      .selectedBadge {
        display: inline-flex;
        align-items: center;
        border: 1px solid #b8c6d8;
        border-radius: 999px;
        padding: 3px 8px;
        color: var(--ink) !important;
        background: #eef3f8;
        font-size: 12px;
        font-weight: 700;
      }
      .actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 2px;
      }
      .action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 62px;
        min-height: 30px;
        padding: 5px 12px;
        border: 1px solid var(--line);
        border-radius: 7px;
        background: #fff;
        color: var(--ink);
        text-decoration: none;
        font-size: 13px;
        font-weight: 700;
      }
      .action.primary {
        border-color: #2463a6;
        background: #2463a6;
        color: #fff;
      }
      @media (max-width: 760px) {
        main { width: min(100vw - 22px, 980px); padding-top: 16px; }
        .topbar { align-items: flex-start; flex-direction: column; }
        h1 { font-size: 23px; }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div class="topbar">
          <h1>Codex 用量中心</h1>
          <a class="action" href="unlock-session.cmd">自动</a>
        </div>
        <div class="subtle">${escapeHtml(activeLabel)}。最近 ${tasks.length} 个任务。</div>
      </header>
      <div class="list">
        ${cards || "<div class=\"task\"><strong>暂无用量数据</strong><span>完成一轮 Codex 对话后会自动生成。</span></div>"}
      </div>
    </main>
  </body>
</html>
`;
}

export async function writeSnapshot(snapshot, options = {}) {
  const outDir = options.outDir || DEFAULT_OUT_DIR;
  await fsp.mkdir(outDir, { recursive: true });
  const latestJsonPath = path.join(outDir, "latest-usage.json");
  const latestMdPath = path.join(outDir, "latest-usage.md");
  const latestUserJsonPath = path.join(outDir, "latest-user-summary.json");
  const latestUserTextPath = path.join(outDir, "latest-user-summary.txt");
  const latestUserMdPath = path.join(outDir, "latest-user-summary.md");
  const latestUserHtmlPath = path.join(outDir, "latest-user-report.html");
  const usageCenterHtmlPath = path.join(outDir, "usage-center.html");
  const unlockCommandPath = path.join(outDir, "unlock-session.cmd");
  const historyPath = path.join(outDir, "history.jsonl");
  const friendlySummary = buildFriendlySummary(snapshot);
  await fsp.writeFile(latestJsonPath, JSON.stringify(snapshot, null, 2), "utf8");
  await fsp.writeFile(latestMdPath, formatMarkdown(snapshot), "utf8");
  await fsp.writeFile(latestUserJsonPath, JSON.stringify(friendlySummary, null, 2), "utf8");
  await fsp.writeFile(latestUserTextPath, formatFriendlyText(snapshot), "utf8");
  await fsp.writeFile(latestUserMdPath, formatFriendlyMarkdown(snapshot), "utf8");
  await fsp.writeFile(latestUserHtmlPath, formatFriendlyHtml(snapshot), "utf8");
  await fsp.writeFile(usageCenterHtmlPath, formatUsageCenterHtml(snapshot), "utf8");
  await fsp.writeFile(unlockCommandPath, buildCollectorCommandFile(["unlock"], outDir), "utf8");
  const taskDir = path.join(outDir, "tasks");
  await fsp.mkdir(taskDir, { recursive: true });
  for (const task of snapshot.recentTasks || []) {
    const taskReportDir = path.join(taskDir, safeFileName(task.id));
    await fsp.mkdir(taskReportDir, { recursive: true });
    const taskSnapshot = { ...snapshot, latestTask: task };
    await fsp.writeFile(path.join(taskReportDir, "report.html"), formatFriendlyHtml(taskSnapshot), "utf8");
    await fsp.writeFile(path.join(taskReportDir, "summary.json"), JSON.stringify(buildFriendlySummary(taskSnapshot), null, 2), "utf8");
    await fsp.writeFile(
      path.join(taskReportDir, "lock-session.cmd"),
      buildCollectorCommandFile(["lock", "--session", task.id], outDir),
      "utf8"
    );
  }
  const friendlyHistory = friendlySummary.hasTask
    ? {
        hasTask: true,
        level: friendlySummary.level,
        statusLabel: friendlySummary.statusLabel,
        headline: friendlySummary.headline,
        primaryAdvice: friendlySummary.primaryAdvice,
        taskTitle: friendlySummary.taskTitle,
        target: friendlySummary.target,
        activeSession: friendlySummary.activeSession,
        last: friendlySummary.last,
        total: friendlySummary.total
      }
    : friendlySummary;
  await fsp.appendFile(historyPath, `${JSON.stringify({
    generatedAt: snapshot.generatedAt,
    latestTask: snapshot.latestTask,
    friendlySummary: friendlyHistory
  })}\n`, "utf8");
  return {
    latestJsonPath,
    latestMdPath,
    latestUserJsonPath,
    latestUserTextPath,
    latestUserMdPath,
    latestUserHtmlPath,
    usageCenterHtmlPath,
    unlockCommandPath,
    historyPath
  };
}

function maybeRunOriginalNotifier(args) {
  const original = process.env.CODEX_USAGE_ORIGINAL_NOTIFY;
  if (!original) return;
  const originalArgs = (process.env.CODEX_USAGE_ORIGINAL_NOTIFY_ARGS || "turn-ended")
    .split("\u0000")
    .filter(Boolean);
  spawnSync(original, originalArgs.length ? originalArgs : args, {
    windowsHide: true,
    stdio: "ignore"
  });
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "latest";
  const json = args.includes("--json");
  const quiet = args.includes("--quiet");
  const includeArchived = args.includes("--include-archived");
  const preferCwd = args.includes("--prefer-cwd");
  const outIndex = args.indexOf("--out");
  const outDir = outIndex >= 0 ? path.resolve(args[outIndex + 1]) : DEFAULT_OUT_DIR;
  const activeSessionPath = activeSessionPathFor(outDir);
  const codexHomeIndex = args.indexOf("--codex-home");
  const codexHome = codexHomeIndex >= 0 ? path.resolve(args[codexHomeIndex + 1]) : DEFAULT_CODEX_HOME;
  const sessionIndex = args.indexOf("--session");
  const preferredSessionId = sessionIndex >= 0 ? String(args[sessionIndex + 1] || "") : "";
  const cwdIndex = args.indexOf("--cwd");
  const preferredCwd =
    cwdIndex >= 0 ? path.resolve(args[cwdIndex + 1]) : (preferCwd || command === "notify" ? process.cwd() : "");

  if (command === "--help" || command === "-h") {
    console.log(`Codex usage collector

Commands:
  node collector.mjs latest [--json] [--prefer-cwd]
  node collector.mjs scan [--out ./usage] [--prefer-cwd]
  node collector.mjs lock --session <session-id>
  node collector.mjs unlock
  node collector.mjs notify [--quiet]

This reads local Codex Desktop JSONL files from ~/.codex/sessions and extracts token_count events.
`);
    return;
  }

  if (command === "notify") {
    maybeRunOriginalNotifier(args.slice(1));
  }

  if (command === "lock") {
    if (!preferredSessionId) throw new Error("Missing --session <session-id>.");
    await writeActiveSessionState(activeSessionPath, {
      mode: "locked",
      sessionId: preferredSessionId,
      lockedAt: new Date().toISOString()
    });
    const snapshot = await collectUsage({ codexHome, includeArchived, preferredCwd, activeSessionPath, outDir });
    const written = await writeSnapshot(snapshot, { outDir });
    if (!quiet) console.log(`Locked Codex usage monitor to session: ${preferredSessionId}\nWrote: ${written.latestUserJsonPath}`);
    return;
  }

  if (command === "unlock") {
    await writeActiveSessionState(activeSessionPath, { mode: "auto", sessionId: "" });
    const snapshot = await collectUsage({ codexHome, includeArchived, preferredCwd, activeSessionPath, outDir });
    const written = await writeSnapshot(snapshot, { outDir });
    if (!quiet) console.log(`Codex usage monitor switched to automatic mode.\nWrote: ${written.latestUserJsonPath}`);
    return;
  }

  const snapshot = await collectUsage({ codexHome, includeArchived, preferredCwd, preferredSessionId, activeSessionPath, outDir });

  if (command === "scan" || command === "notify") {
    const written = await writeSnapshot(snapshot, { outDir });
    if (!quiet) {
      console.log(formatConsole(snapshot));
      console.log(`Wrote: ${written.latestMdPath}`);
    }
    return;
  }

  if (json) {
    console.log(JSON.stringify(snapshot, null, 2));
  } else {
    console.log(formatConsole(snapshot));
  }
}

if (process.argv[1] === __filename) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
