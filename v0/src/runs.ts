import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DraftView, ProcessItem, ResultView, RunOutcome, RunStatus, SubRunView } from "./local-contract.ts";
import { livePhrase } from "../ui/feed.ts";
import { listArtifactIds, loadDraft, loadReview, readJsonFile, type CheckArtifact, type RoundRecord, type SubagentRecord, type TaskLayout, type TaskRegistry } from "./layout.ts";
import { readSessionProcess, type LiveCall } from "./process.ts";
import { splitDraft } from "./review.ts";

const AGENT_ID = /^(writer|reviewer|sync_checker)-\d+$/;

function agentOf(item: Extract<ProcessItem, { kind: "tool" }>): string | undefined {
  const args = item.args && typeof item.args === "object" ? item.args as Record<string, unknown> : {};
  if (typeof args.agent_id === "string" && AGENT_ID.test(args.agent_id)) return args.agent_id;
  const result = (item.result ?? "").trim();
  return AGENT_ID.test(result) ? result : undefined;
}

function textOf(args: unknown, key: string): string {
  if (!args || typeof args !== "object") return "";
  const value = (args as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

function reviewSummary(review: Record<string, unknown>): string {
  const typed = review as { checks?: Record<string, string>; feedback?: Array<{ kind?: string; reason?: string }> };
  return reviewLine(typed);
}

function reviewLine(review: { checks?: Record<string, string>; feedback?: Array<{ kind?: string; reason?: string }> }): string {
  const checks = Object.values(review.checks ?? {});
  const feedback = review.feedback ?? [];
  const reason = (kind: string) => feedback.find(item => item.kind === kind)?.reason;
  if (checks.some(status => status === "failed")) return reason("violation") ? `未通过：${reason("violation")}` : "检查发现内容冲突";
  if (checks.some(status => status === "needs_verification")) return reason("needs_verification") ? `待核实：${reason("needs_verification")}` : "检查包含核实项";
  return reason("suggestion") ? `通过：${reason("suggestion")}` : "通过：四项内容检查通过";
}

function resultFor(task: TaskLayout, id: string, drafts: DraftView[]): ResultView {
  try {
    if (id.startsWith("draft_")) {
      const draft = drafts.find(item => item.draftId === id);
      const loaded = loadDraft(task, id);
      const split = loaded ? splitDraft(loaded.markdown) : { error: "缺失" };
      if (!draft || !loaded || "error" in split) return { artifactId: id, draftId: id, title: draft?.title || id, summary: "暂时无法读取", readable: false };
      const review = listArtifactIds(task, "review").map(reviewId => loadReview(task, reviewId)).filter(item => item?.draft_id === id).at(-1);
      return { artifactId: id, draftId: id, title: draft.title || id, summary: review ? reviewSummary(review.review) : "正文已保存，尚未完成检查", readable: true, finalized: draft.finalized };
    }
    if (id.startsWith("plan_")) {
      const file = join(task.artifactsDir, `${id}.md`);
      if (!existsSync(file)) return { artifactId: id, title: id, summary: "暂时无法读取", readable: false };
      const heading = readFileSync(file, "utf8").split("\n").find(line => line.startsWith("# "));
      return { artifactId: id, title: heading?.slice(2).trim() || "章节方案", summary: "章节方案", readable: true };
    }
    if (id.startsWith("review_")) {
      const review = loadReview(task, id);
      if (!review) return { artifactId: id, title: id, summary: "暂时无法读取", readable: false };
      const draft = drafts.find(item => item.draftId === review.draft_id);
      return { artifactId: id, title: draft ? `《${draft.title}》检查` : "检查报告", summary: reviewSummary(review.review), readable: true };
    }
    if (id.startsWith("check_")) {
      const check = readJsonFile<CheckArtifact>(join(task.artifactsDir, `${id}.json`));
      const conflict = check.verdicts.find(verdict => verdict.verdict === "conflict");
      const summary = conflict ? `冲突：${String(conflict.reason ?? "与已有资料不一致")}` : "核对未发现冲突";
      return { artifactId: id, title: "核对结论", summary, readable: true };
    }
    if (id.startsWith("proposal_")) return { artifactId: id, title: "资料变更", summary: "待作者确认的资料变更", readable: true };
    return { artifactId: id, title: id, summary: "已保存", readable: true };
  } catch {
    return { artifactId: id, title: id, summary: "暂时无法读取", readable: false };
  }
}

function classify(agent: SubagentRecord, round: RoundRecord, status: RunStatus, lastMessage: string | undefined, artifacts: string[]): RunOutcome {
  if (!round.endedAt) return status === "stopping" ? "stopping" : "running";
  if (round.outcome === "failed") return "failed";
  if (round.outcome === "stopped") return "stopped";
  if (round.outcome === "retired") return round.note === "进程退出" || agent.status === "terminated" ? "interrupted" : "stopped";
  if (artifacts.length) return "returned";
  if (lastMessage) return "replied";
  return "no-result";
}

function sliceItems(items: ProcessItem[], rounds: RoundRecord[], index: number): ProcessItem[] {
  const start = index === 0 ? Number.NEGATIVE_INFINITY : Date.parse(rounds[index]!.startedAt);
  const end = rounds[index + 1] ? Date.parse(rounds[index + 1]!.startedAt) : Number.POSITIVE_INFINITY;
  return items.filter(item => item.at >= start && item.at < end && !(item.kind === "message" && item.role === "user"));
}

function unresolvedFor(round: RoundRecord, agent: SubagentRecord): "running" | "stopped" | "interrupted" | "error" {
  if (!round.endedAt) return "running";
  if (round.outcome === "stopped") return "stopped";
  if (round.outcome === "retired" && (round.note === "进程退出" || agent.status === "terminated")) return "interrupted";
  if (round.outcome === "failed") return "error";
  return "running";
}

function liveAction(items: ProcessItem[], streaming?: string): string | undefined {
  const current = [...items].reverse().find(item => (item.kind === "tool" && item.state === "running") || item.kind === "thinking" || (item.kind === "message" && item.id.startsWith("live:")));
  if (current) return livePhrase(current);
  if (streaming) return streaming;
  return undefined;
}

function callOf(item: Extract<ProcessItem, { kind: "tool" }>): SubRunView["call"] {
  return { name: item.name, args: item.args, result: item.result, error: item.error };
}

export function buildRuns(task: TaskLayout, registry: TaskRegistry, status: RunStatus, process: ProcessItem[], drafts: DraftView[], calls: LiveCall[] = [], liveText = new Map<string, string>()): SubRunView[] {
  const dispatches = process.filter((item): item is Extract<ProcessItem, { kind: "tool" }> => item.kind === "tool" && (item.name === "spawn_subagent" || item.name === "send_message"));
  const claimed = new Set<RoundRecord>();
  const runs: SubRunView[] = [];
  const sessions = new Map<string, ProcessItem[]>();
  const itemsFor = (agent: SubagentRecord) => {
    let saved = sessions.get(agent.id);
    if (!saved) {
      saved = readSessionProcess(agent.sessionFile, task.sessionDir, agent.workspaceDir, "running").items;
      sessions.set(agent.id, saved);
    }
    return saved;
  };
  const viewFor = (agent: SubagentRecord, round: RoundRecord, dispatch?: Extract<ProcessItem, { kind: "tool" }>, extra: Partial<SubRunView> = {}): SubRunView => {
    const index = agent.rounds.indexOf(round);
    const unresolved = unresolvedFor(round, agent);
    const sessionItems = itemsFor(agent);
    const sliced = sliceItems(sessionItems, agent.rounds, index).map(item => item.kind === "tool" && item.state === "running" && unresolved !== "running" ? { ...item, state: unresolved } : item);
    const withLive = [...sliced];
    for (const call of calls.filter(item => item.agentId === agent.id)) {
      const found = withLive.find((item): item is Extract<ProcessItem, { kind: "tool" }> => item.kind === "tool" && item.id === call.id);
      if (found && found.state === "running" && call.output) found.output = call.output;
      else if (!found && !round.endedAt) withLive.push({ kind: "tool", id: call.id, name: call.name, args: call.args, output: call.output, state: "running", at: call.at });
    }
    const streaming = !round.endedAt ? liveText.get(agent.id) : undefined;
    if (streaming) withLive.push({ kind: "message", id: `live:${agent.id}`, role: "assistant", text: streaming, at: Date.now() });
    const lastMessage = [...withLive].reverse().find((item): item is Extract<ProcessItem, { kind: "message" }> => item.kind === "message" && item.role === "assistant" && !item.id.startsWith("live:"))?.text;
    const artifacts = extra.inline ? [] : round.artifacts;
    const outcome = extra.missing ? "no-result" : classify(agent, round, status, lastMessage, artifacts);
    const results = extra.inline || extra.missing ? [] : artifacts.map(id => resultFor(task, id, drafts));
    const title = round.title?.trim() || textOf(dispatch?.args, dispatch?.name === "send_message" ? "message" : "task") || undefined;
    return {
      agentId: agent.id,
      round: index + 1,
      dispatchCallId: round.dispatchCallId ?? dispatch?.id,
      continued: round.continued === true || dispatch?.name === "send_message",
      title,
      instruction: round.instruction || title || "",
      outcome,
      startedAt: round.startedAt,
      endedAt: round.endedAt,
      results,
      lastMessage: extra.inline ? undefined : lastMessage,
      error: outcome === "failed" ? (round.note || agent.failureReason || "失败").split("\n")[0] : undefined,
      liveAction: outcome === "running" || outcome === "stopping" ? liveAction(withLive, streaming) : undefined,
      items: extra.inline || extra.missing ? [] : withLive,
      call: dispatch ? callOf(dispatch) : undefined,
      ...extra,
    };
  };

  for (const dispatch of dispatches) {
    const agentId = agentOf(dispatch);
    const agent = agentId ? registry.subagents.find(item => item.id === agentId) : undefined;
    if (!agent) {
      const title = textOf(dispatch.args, dispatch.name === "send_message" ? "message" : "task");
      runs.push({
        agentId: agentId ?? "子任务", round: 0, dispatchCallId: dispatch.id, continued: dispatch.name === "send_message",
        title: title || undefined, instruction: title, outcome: dispatch.error ? "failed" : "no-result", startedAt: new Date(dispatch.at).toISOString(),
        results: [], items: [], missing: !dispatch.error, error: dispatch.error ? (dispatch.result ?? "").split("\n")[0] : undefined, call: callOf(dispatch),
      });
      continue;
    }
    const matched = agent.rounds.find(round => round.dispatchCallId === dispatch.id) ?? agent.rounds.find(round => !round.dispatchCallId && !claimed.has(round));
    if (matched) {
      claimed.add(matched);
      runs.push(viewFor(agent, matched, dispatch));
      continue;
    }
    const title = textOf(dispatch.args, dispatch.name === "send_message" ? "message" : "task");
    runs.push({
      agentId: agent.id, round: 0, dispatchCallId: dispatch.id, continued: dispatch.name === "send_message",
      title: title || undefined, instruction: title, outcome: dispatch.error ? "failed" : "no-result", startedAt: new Date(dispatch.at).toISOString(),
      results: [], items: [], missing: true, error: dispatch.error ? (dispatch.result ?? "").split("\n")[0] : undefined, call: callOf(dispatch),
    });
  }

  for (const agent of registry.subagents) {
    for (const round of agent.rounds) {
      if (claimed.has(round)) continue;
      if (round.dispatchCallId && dispatches.some(item => item.id === round.dispatchCallId)) continue;
      runs.push(viewFor(agent, round));
    }
  }
  return runs.sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt) || a.agentId.localeCompare(b.agentId) || a.round - b.round);
}
