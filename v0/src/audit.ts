import { existsSync, readFileSync, realpathSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { NoyaConfig } from "./config.ts";
import { resolveToolPath } from "./guard.ts";
import { listArtifactIds, listTasks, loadRegistry, resolveWork, taskLayout, type SubagentRecord } from "./layout.ts";
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

function collect(file: string, role: string): { hits: ToolHit[]; input: number; output: number; started?: string; ended?: string } {
  const hits: ToolHit[] = [];
  let input = 0;
  let output = 0;
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
      usage?: { input?: number; output?: number };
    };
    if (message.role === "assistant") {
      input += message.usage?.input ?? 0;
      output += message.usage?.output ?? 0;
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
  return { hits, input, output, started, ended };
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
  report: { input: number; output: number; started?: string; ended?: string },
  agent?: SubagentRecord,
): string {
  const duration = agent
    ? agent.rounds.reduce((sum, round) => sum + (round.endedAt ? Date.parse(round.endedAt) - Date.parse(round.startedAt) : 0), 0)
    : report.started && report.ended
      ? Date.parse(report.ended) - Date.parse(report.started)
      : 0;
  return `- ${label}：输入 ${report.input}，输出 ${report.output}，耗时 ${duration} ms`;
}

