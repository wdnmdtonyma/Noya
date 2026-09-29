import { existsSync, readFileSync, realpathSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { NoyaConfig } from "./config.ts";
import { resolveToolPath } from "./guard.ts";
import { listArtifactIds, listTasks, loadRegistry, resolveWork, taskLayout, type SubagentRecord, type TaskLayout } from "./layout.ts";
import { messageText } from "./transcript.ts";
import { isRefusal } from "./util.ts";

interface ToolHit {
  role: string;
  tool: string;
  rejected: boolean;
  reason?: string;
  path?: string;
}

function readEntries(file: string): Array<Record<string, unknown>> {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

interface UsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

function collect(file: string, role: string): { hits: ToolHit[]; usage: UsageTotals; started?: string; ended?: string } {
  const hits: ToolHit[] = [];
  const usage: UsageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
  let started: string | undefined;
  let ended: string | undefined;
  const calls = new Map<string, { tool: string; path?: string }>();
  for (const entry of readEntries(file)) {
    const timestamp = typeof entry.timestamp === "string" ? entry.timestamp : undefined;
    if (timestamp) {
      started ??= timestamp;
      ended = timestamp;
    }
    if (entry.type !== "message") continue;
    const message = entry.message as {
      role?: string;
      content?: unknown;
      toolName?: string;
      toolCallId?: string;
      isError?: boolean;
      usage?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; cost?: { total?: number } };
    };
    if (message.role === "assistant") {
      usage.input += message.usage?.input ?? 0;
      usage.output += message.usage?.output ?? 0;
      usage.cacheRead += message.usage?.cacheRead ?? 0;
      usage.cacheWrite += message.usage?.cacheWrite ?? 0;
      usage.cost += message.usage?.cost?.total ?? 0;
      if (Array.isArray(message.content)) {
        for (const part of message.content as Array<{ type?: string; id?: string; name?: string; arguments?: { path?: string } }>) {
          if (part.type !== "toolCall" || !part.name) continue;
          if (part.id) calls.set(part.id, { tool: part.name, path: part.arguments?.path });
          hits.push({ role, tool: part.name, rejected: false, path: part.arguments?.path });
        }
      }
    }
    if (message.role === "toolResult") {
      const text = messageText(message);
      const call = message.toolCallId ? calls.get(message.toolCallId) : undefined;
      if (message.isError && isRefusal(text)) {
        hits.push({ role, tool: message.toolName ?? call?.tool ?? "unknown", rejected: true, reason: text, path: call?.path });
      }
    }
  }
  return { hits, usage, started, ended };
}

function skillName(path: string | undefined, skillsDir: string, cwd: string): string | undefined {
  if (!path) return undefined;
  try {
    const resolved = resolveToolPath(path, cwd);
    const root = realpathSync(skillsDir);
    if (!resolved.endsWith("SKILL.md") || !resolved.startsWith(root)) return undefined;
    return resolved.slice(root.length + 1).split("/")[0];
  } catch {
    return undefined;
  }
}

export async function writeAudit(config: NoyaConfig, workRef: string, taskId?: string): Promise<string> {
  const agentDir = join(config.worksRoot, ".noya", "agent");
  const work = resolveWork(config.worksRoot, agentDir, workRef);
  const registries = listTasks(work);
  const registry = taskId ? registries.find((item) => item.task_id === taskId) : registries.at(-1);
  if (!registry) throw new Error(taskId ? `找不到写作任务 ${taskId}` : "还没有写作任务");
  const task = taskLayout(work, registry.task_id);
  const stored = loadRegistry(task);
  const context = collect(stored.context_session_file, "context");
  const subagentReports = stored.subagents.map((agent) => ({
    agent,
    report: collect(agent.sessionFile, agent.id),
  }));
  const hits = [context, ...subagentReports.map((item) => item.report)].flatMap((item) => item.hits);
  const counts = new Map<string, number>();
  for (const hit of hits) {
    if (hit.rejected) continue;
    const key = `${hit.role} ${hit.tool}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const skills = new Map<string, number>();
  for (const hit of hits) {
    if (hit.rejected || hit.tool !== "read") continue;
    const name = skillName(hit.path, config.skillsDir, hit.role === "context" ? work.workDir : stored.subagents.find((agent) => agent.id === hit.role)?.workspaceDir ?? work.workDir);
    if (!name) continue;
    skills.set(name, (skills.get(name) ?? 0) + 1);
  }
  const versions = ["package", "plan", "draft", "review", "proposal", "check"].map(
    (prefix) => `- ${prefix}：${listArtifactIds(task, prefix).length}`,
  );
  const proposals = listArtifactIds(task, "proposal");
  const checks = listArtifactIds(task, "check").map((id) => JSON.parse(readFileSync(join(task.artifactsDir, `${id}.json`), "utf8")) as { proposal_id: string });
  const checkLines = proposals.map((id) => `- ${id}：${checks.filter((check) => check.proposal_id === id).length} 次核对`);
  const reviews = listArtifactIds(task, "review").map(
    (id) => JSON.parse(readFileSync(join(task.artifactsDir, `${id}.json`), "utf8")) as { draft_id: string; review: { checks: Record<string, string> } },
  );
  const drafts = listArtifactIds(task, "draft");
  const coverage = drafts.map((draftId) => {
    const related = reviews.filter((review) => review.draft_id === draftId);
    return `- ${draftId}：${related.length > 0 ? `有检查 ${related.length} 次` : "没有检查"}`;
  });
  const finalized = stored.finalizations.map((item) => {
    const related = reviews.filter((review) => review.draft_id === item.draft_id);
    if (related.length === 0) return `- ${item.draft_id}（章节 ${item.chapter_id}）没有检查就被定稿`;
    const latest = related.at(-1);
    return `- 定稿 ${item.draft_id} 最近一次检查：${formatChecks(latest?.review.checks)}`;
  });
  const latestDraft = drafts.at(-1);
  const latestReview = reviews.filter((review) => review.draft_id === latestDraft).at(-1);
  const latestLine = latestDraft
    ? `- 最后一版初稿 ${latestDraft}：${latestReview ? formatChecks(latestReview.review.checks) : "没有检查"}`
    : "- 没有初稿";
  const tokenLines = [
    tokenLine("context", context),
    ...subagentReports.map((item) => tokenLine(item.agent.id, item.report, item.agent)),
  ];
  const planLines = planReviewLines(stored, task, stored.context_session_file);
  const emptyRounds = stored.subagents.flatMap((agent) =>
    agent.rounds
      .filter((round) => round.artifacts.length === 0)
      .map((round) => `- ${agent.id} ${round.startedAt} ${round.outcome ?? "未结束"} ${round.note ?? ""}`.trim()),
  );
  const rejected = hits.filter((hit) => hit.rejected);
  const report = [
    `# 审计 ${stored.task_id}`,
    "",
    "## 工具调用",
    ...[...counts.entries()].sort().map(([key, count]) => `- ${key}：${count}`),
    counts.size === 0 ? "- 没有工具调用" : "",
    "",
    "## 被拒绝的调用",
    ...rejected.map((hit) => `- ${hit.role} ${hit.tool}：${hit.reason}`),
    rejected.length === 0 ? "- 没有" : "",
    "",
    "## Skill",
    ...[...skills.entries()].map(([name, count]) => `- ${name}：${count}`),
    skills.size === 0 ? "- 没有读取 Skill 文件" : "",
    "",
    "## 产物版本",
    ...versions,
    "",
    "## 同步清单核对次数",
    ...(checkLines.length > 0 ? checkLines : ["- 没有同步清单"]),
    "",
    "## 检查覆盖",
    ...(coverage.length > 0 ? coverage : ["- 没有初稿"]),
    ...finalized,
    latestLine,
    "",
    "## 方案检查",
    ...planLines,
    "",
    "## Token 与耗时",
    ...tokenLines,
    "",
    "## 未提交产物的轮次",
    ...(emptyRounds.length > 0 ? emptyRounds : ["- 没有"]),
    "",
  ]
    .filter((line) => line !== undefined)
    .join("\n");
  const output = join(task.taskDir, "audit.md");
  await writeFile(output, report);
  return output;
}

function formatChecks(checks: Record<string, string> | undefined): string {
  if (!checks) return "没有结论";
  return ["requirements", "character_motivation", "possessions_and_abilities", "ability_rules"]
    .map((gate) => `${gate}=${checks[gate] ?? "缺失"}`)
    .join("，");
}

function tokenLine(
  label: string,
  report: { usage: UsageTotals; started?: string; ended?: string },
  agent?: SubagentRecord,
): string {
  const duration = agent
    ? agent.rounds.reduce((sum, round) => sum + (round.endedAt ? Date.parse(round.endedAt) - Date.parse(round.startedAt) : 0), 0)
    : report.started && report.ended
      ? Date.parse(report.ended) - Date.parse(report.started)
      : 0;
  const usage = report.usage;
  return `- ${label}：输入 ${usage.input}，缓存读取 ${usage.cacheRead}，缓存写入 ${usage.cacheWrite}，输出 ${usage.output}，费用 ${usage.cost}，耗时 ${duration} ms`;
}

function planReviewLines(stored: ReturnType<typeof loadRegistry>, task: TaskLayout, contextFile: string): string[] {
  const plans = listArtifactIds(task, "plan");
  if (plans.length === 0) return ["- 没有方案"];
  const reads = readToolPaths(contextFile);
  return plans.map((planId) => {
    const writer = stored.subagents.find((agent) => agent.rounds.some((round) => round.artifacts.includes(planId)) || agent.artifacts.includes(planId));
    if (!writer) return `- ${planId}：找不到提交它的 Writer`;
    const planRound = writer.rounds.find((round) => round.artifacts.includes(planId));
    const planAt = Date.parse(planRound?.endedAt ?? planRound?.startedAt ?? "");
    const sameRoundDraft = planRound?.artifacts.find((id) => id.startsWith("draft_"));
    const laterRound = writer.rounds.find((round) => {
      if (round === planRound || !round.artifacts.some((id) => id.startsWith("draft_"))) return false;
      const at = Date.parse(round.startedAt);
      return !Number.isNaN(planAt) && !Number.isNaN(at) && at > planAt;
    });
    const draftId = laterRound?.artifacts.find((id) => id.startsWith("draft_")) ?? sameRoundDraft;
    if (!draftId) return `- ${planId}（${writer.id}）：还没有据此提交初稿`;
    const draftAt = laterRound ? Date.parse(laterRound.startedAt) : planAt;
    const saw = !sameRoundDraft && reads.some((read) => {
      const path = read.path.replaceAll("\\", "/");
      const hit = path.includes(planId) || path === "plan.md" || path.endsWith("/plan.md");
      return hit && read.at > planAt && read.at < draftAt;
    });
    return `- ${planId}（${writer.id} → ${draftId}）：Context 在写初稿前${saw ? "读过方案" : "没有读方案"}`;
  });
}

function readToolPaths(file: string): Array<{ at: number; path: string }> {
  const reads: Array<{ at: number; path: string }> = [];
  for (const entry of readEntries(file)) {
    const at = Date.parse(typeof entry.timestamp === "string" ? entry.timestamp : "");
    if (Number.isNaN(at) || entry.type !== "message") continue;
    const message = entry.message as { role?: string; content?: unknown };
    if (message.role !== "assistant" || !Array.isArray(message.content)) continue;
    for (const part of message.content as Array<{ type?: string; name?: string; arguments?: { path?: string } }>) {
      if (part.type === "toolCall" && part.name === "read" && part.arguments?.path) reads.push({ at, path: part.arguments.path });
    }
  }
  return reads;
}

