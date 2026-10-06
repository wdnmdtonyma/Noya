import type { ProcessItem, RunOutcome, RunStatus, SubRunView } from "../src/local-contract.ts";

export const OUTCOME_LABEL: Record<RunOutcome, string> = {
  running: "进行中",
  stopping: "正在停止",
  returned: "已交回",
  replied: "已回复",
  "no-result": "未交回成果",
  failed: "失败",
  stopped: "已停止",
  interrupted: "已中断",
};

const ROUTINE_EVENTS = new Set(["start", "end", "stop_requested", "failed", "interrupted"]);
const DISPATCH_TOOLS = new Set(["spawn_subagent", "send_message"]);

interface Activity {
  kind: string;
  name: string;
  verb: string;
  past: string;
  target: string;
  file: string | null;
}

function argText(args: unknown, keys: string[]): string {
  if (!args || typeof args !== "object") return "";
  const record = args as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function baseName(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts.at(-1) || path;
}

function namedTarget(name: string, args: unknown): string {
  const record = args && typeof args === "object" ? args as Record<string, unknown> : {};
  if (name === "query_canon") {
    if (typeof record.query === "string" && record.query.trim()) return record.query.trim();
    if (Array.isArray(record.ids) && record.ids.length) return record.ids.map(String).join("、");
    if (Array.isArray(record.entities) && record.entities.length) return record.entities.map(String).join("、");
    if (typeof record.type === "string") return record.type;
    return "";
  }
  if (name === "submit_draft") return typeof record.title === "string" && record.title.trim() ? `《${record.title.trim()}》` : "";
  if (name === "spawn_subagent" || name === "send_message" || name === "stop_subagent") return typeof record.agent_id === "string" ? record.agent_id : "";
  return "";
}

const NAMED: Record<string, [string, string]> = {
  query_canon: ["查阅设定", "查阅了设定"],
  submit_draft: ["提交正文", "提交了正文"],
  submit_plan: ["保存方案", "保存了方案"],
  save_plan: ["保存方案", "保存了方案"],
  save_review: ["保存检查", "保存了检查"],
  apply_sync: ["应用资料变更", "应用了资料变更"],
  apply_canon_changes: ["应用资料变更", "应用了资料变更"],
  save_package: ["保存写作材料", "保存了写作材料"],
  save_revision: ["保存正文", "保存了正文"],
  save_sync_proposal: ["保存资料变更", "保存了资料变更"],
  save_sync_check: ["保存核对", "保存了核对"],
  write_canon: ["写入资料", "写入了资料"],
  ask_author: ["询问作者", "询问了作者"],
  get_subagents: ["查看子任务", "查看了子任务"],
  stop_subagent: ["停止子任务", "停止了子任务"],
  spawn_subagent: ["派出子任务", "派出了子任务"],
  send_message: ["追加要求", "追加了要求"],
};

export function toolActivity(item: Extract<ProcessItem, { kind: "tool" }>): Activity {
  const name = item.name || "unknown_tool";
  const kind = name.toLowerCase();
  const path = argText(item.args, ["path", "file_path", "filePath"]);
  const file = path ? baseName(path) : null;
  const make = (activityKind: string, verb: string, past: string, target = "", activityFile: string | null = null): Activity => ({ kind: activityKind, name, verb, past, target, file: activityFile });
  if (["read", "read_file", "readfile", "read_files"].includes(kind)) return make("read", "读取", "读取了", file ?? "", file);
  if (["edit", "edit_file", "editfile"].includes(kind)) return make("edit", "修改", "修改了", file ?? "", file);
  if (["write", "write_file", "writefile"].includes(kind)) return make("write", "写入", "写入了", file ?? "", file);
  const pattern = argText(item.args, ["pattern", "query", "glob"]);
  if (["grep", "glob", "search", "search_files", "find", "find_files", "ls", "ripgrep"].includes(kind)) return make("search", "搜索", "搜索了", pattern);
  const command = argText(item.args, ["command", "cmd"]);
  if (["bash", "shell", "exec_command", "run_command", "terminal", "exec"].includes(kind)) return make("command", "运行", "运行了", command);
  const named = NAMED[kind];
  if (named) return make(kind, named[0], named[1], namedTarget(kind, item.args));
  return make("generic", "", "", name);
}

function phrase(activity: Activity, tense: "past" | "verb"): string {
  if (activity.kind === "generic") return activity.name;
  const word = tense === "past" ? activity.past : activity.verb;
  if (!activity.target) return word;
  if (tense === "past" && (activity.kind === "search" || activity.kind === "command")) return `${word} ${activity.target}`;
  if (tense === "past" && activity.target.startsWith("《")) return `${word}${activity.target}`;
  if (tense === "past") return `${word}：${activity.target}`;
  return `${word} ${activity.target}`;
}

export function livePhrase(item: ProcessItem | undefined): string {
  if (!item) return "正在处理";
  if (item.kind === "thinking") return "正在思考";
  if (item.kind === "message") return "正在回复";
  if (item.kind !== "tool") return "正在处理";
  const activity = toolActivity(item);
  return activity.kind === "generic" ? `正在运行 ${activity.name}` : `正在${phrase(activity, "verb")}`;
}

function toolBody(item: Extract<ProcessItem, { kind: "tool" }>): string {
  return `${item.output ?? ""}\n${item.result ?? ""}`;
}

/** One line of what was done. The same tools produce the same line for every Agent. */
export function activitySummary(items: ProcessItem[], options?: { connected?: boolean }): string {
  const tools = items.filter((item): item is Extract<ProcessItem, { kind: "tool" }> => item.kind === "tool" && !DISPATCH_TOOLS.has(item.name));
  const thoughts = items.filter(item => item.kind === "thinking");
  if (!tools.length) return thoughts.length ? "思考" : "";
  const files = new Map<string, { activity: Activity; names: Set<string> }>();
  const failures: string[] = [];
  const phrases: string[] = [];
  const seen = new Set<string>();
  let running: Activity | undefined;
  const push = (list: string[], text: string) => {
    if (!text || seen.has(text)) return;
    seen.add(text);
    list.push(text);
  };
  for (const item of tools) {
    const activity = toolActivity(item);
    if (item.state === "running") { running = activity; continue; }
    const bad = item.error || item.state === "error" ? "失败" : item.state === "stopped" ? "已停止" : item.state === "interrupted" ? "未完成" : "";
    if (bad) {
      push(failures, activity.kind === "generic" ? `${activity.name} ${bad}` : `${phrase(activity, "verb")} ${bad}`);
      continue;
    }
    if (activity.kind === "edit" && /No changes applied/i.test(toolBody(item))) {
      push(phrases, `未改动 ${activity.target}`.trim());
      continue;
    }
    if (activity.file) {
      const group = files.get(activity.kind) ?? { activity, names: new Set<string>() };
      group.names.add(activity.file);
      files.set(activity.kind, group);
      continue;
    }
    push(phrases, phrase(activity, "past"));
  }
  const fileParts = [...files.values()].map(({ activity, names }) => names.size === 1 ? `${activity.past} ${[...names][0]}` : `${activity.past} ${names.size} 个文件`);
  let parts = [...failures, ...fileParts, ...phrases];
  if (parts.length > 3) parts = [...parts.slice(0, 2), `等 ${parts.length} 项`];
  if (running) {
    const current = running.kind === "generic" ? `正在运行 ${running.name}` : `正在${phrase(running, "verb")}`;
    parts.push(`${options?.connected === false ? "最后已知 · " : ""}${current}`);
  }
  return parts.join("，");
}

export interface FeedBlock {
  kind: "group" | "card" | "message" | "event" | "unknown";
  id: string;
  summary?: string;
  items?: ProcessItem[];
  run?: SubRunView;
  message?: Extract<ProcessItem, { kind: "message" }>;
  event?: Extract<ProcessItem, { kind: "event" }>;
  unknown?: Extract<ProcessItem, { kind: "unknown" }>;
}

export interface TurnModel {
  id: string;
  user?: Extract<ProcessItem, { kind: "message" }>;
  blocks: FeedBlock[];
  running: boolean;
  abnormal: "failed" | "interrupted" | "stopped" | null;
  label: string;
  folded: FeedBlock[];
  liveLabel?: string;
  liveStart?: number;
  liveFrozen?: boolean;
}

function dispatchTool(item: ProcessItem): Extract<ProcessItem, { kind: "tool" }> | undefined {
  return item.kind === "tool" && DISPATCH_TOOLS.has(item.name) ? item : undefined;
}

function blocksFrom(items: ProcessItem[], runs: SubRunView[], connected: boolean): FeedBlock[] {
  const byCall = new Map(runs.filter(run => run.dispatchCallId).map(run => [run.dispatchCallId!, run]));
  const blocks: FeedBlock[] = [];
  let group: ProcessItem[] = [];
  const flush = () => {
    if (!group.length) return;
    const summary = activitySummary(group, { connected });
    blocks.push({ kind: "group", id: `group:${group[0]!.id}`, summary, items: group });
    group = [];
  };
  for (const item of items) {
    if (item.kind === "event" && ROUTINE_EVENTS.has(item.event)) continue;
    const dispatch = dispatchTool(item);
    if (dispatch) {
      flush();
      const run = byCall.get(dispatch.id) ?? missingRun(dispatch);
      blocks.push({ kind: "card", id: `card:${dispatch.id}`, run });
      continue;
    }
    if (item.kind === "thinking" || item.kind === "tool") { group.push(item); continue; }
    flush();
    if (item.kind === "message") blocks.push({ kind: "message", id: item.id, message: item });
    else if (item.kind === "event") blocks.push({ kind: "event", id: item.id, event: item });
    else blocks.push({ kind: "unknown", id: item.id, unknown: item });
  }
  flush();
  return blocks;
}

function missingRun(item: Extract<ProcessItem, { kind: "tool" }>): SubRunView {
  const args = item.args && typeof item.args === "object" ? item.args as Record<string, unknown> : {};
  const title = typeof args.task === "string" ? args.task : typeof args.message === "string" ? args.message : undefined;
  const agentId = typeof args.agent_id === "string" ? args.agent_id : "子任务";
  return {
    agentId, round: 0, dispatchCallId: item.id, continued: item.name === "send_message", title, instruction: title ?? "",
    outcome: item.error ? "failed" : "no-result", startedAt: new Date(item.at).toISOString(), results: [], items: [], missing: !item.error,
    error: item.error ? (item.result ?? "").split("\n")[0] : undefined,
    call: { name: item.name, args: item.args, result: item.result, error: item.error },
  };
}

function durationLabel(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${String(seconds % 60).padStart(2, "0")} 秒`;
}

function foldLabel(ms: number | undefined, ending: TurnModel["abnormal"]): string {
  const duration = ms === undefined ? "" : durationLabel(ms);
  if (ending === "failed") return duration ? `处理 ${duration}后失败` : "失败";
  if (ending === "interrupted") return duration ? `处理 ${duration}后中断` : "中断";
  if (ending === "stopped") return duration ? `处理 ${duration}后停止` : "停止";
  return duration ? `已处理 ${duration}` : "已处理";
}

function keepFolded(block: FeedBlock, lastReply: FeedBlock | undefined, abnormal: boolean): boolean {
  if (block.kind === "card" || block.kind === "event" || block.kind === "unknown") return true;
  return !abnormal && block === lastReply;
}

export function deriveTurns(process: ProcessItem[], runs: SubRunView[], status: RunStatus, connected = true): TurnModel[] {
  const ordered = [...process].sort((a, b) => a.at - b.at);
  const turns: Array<{ user?: Extract<ProcessItem, { kind: "message" }>; items: ProcessItem[] }> = [];
  for (const item of ordered) {
    if (item.kind === "message" && item.role === "user") { turns.push({ user: item, items: [] }); continue; }
    if (!turns.length) turns.push({ items: [] });
    turns.at(-1)!.items.push(item);
  }
  if (!turns.length && runs.length) turns.push({ items: [] });
  const live = status === "running" || status === "stopping";
  const placed = new Set(ordered.flatMap(item => { const dispatch = dispatchTool(item); return dispatch ? [dispatch.id] : []; }));
  return turns.map((turn, index) => {
    const blocks = blocksFrom(turn.items, runs, connected);
    const last = index === turns.length - 1;
    const running = last && live;
    const marked = [...turn.items].reverse().find((item): item is Extract<ProcessItem, { kind: "event" }> => item.kind === "event" && (item.event === "failed" || item.event === "interrupted" || item.event === "stopped"));
    const abnormal = running ? null : marked ? marked.event as TurnModel["abnormal"] : last && (status === "failed" || status === "interrupted" || status === "stopped") ? status : null;
    const lastReply = [...blocks].reverse().find(block => block.kind === "message" && block.message?.role === "assistant");
    const folded = blocks.filter(block => keepFolded(block, lastReply, !!abnormal));
    const orphans = last ? runs.filter(run => !run.dispatchCallId || !placed.has(run.dispatchCallId)) : [];
    const orphanBlocks = orphans.map(run => ({ kind: "card" as const, id: `card:${run.dispatchCallId ?? `${run.agentId}:${run.round}`}`, run }));
    const times = [turn.user?.at, ...turn.items.filter(item => item.kind !== "event").map(item => item.at)].filter((at): at is number => typeof at === "number" && Number.isFinite(at));
    const elapsed = times.length >= 2 ? Math.max(...times) - Math.min(...times) : undefined;
    const start = times[0] ?? turn.user?.at;
    return {
      id: `turn:${turn.user?.id ?? turn.items[0]?.id ?? index}`,
      user: turn.user,
      blocks: [...blocks, ...orphanBlocks],
      running,
      abnormal,
      label: running ? "" : foldLabel(elapsed, abnormal),
      folded: [...folded, ...orphanBlocks],
      ...(running ? { liveLabel: !connected ? "连接断开，最新进展尚未确认" : status === "stopping" ? "正在停止" : "正在处理", liveStart: start, liveFrozen: !connected } : {}),
    };
  });
}

export interface SubRow {
  agentId: string;
  title: string;
  continued: number;
  line: string;
  outcome: RunOutcome;
  label: string;
  activeAt: number;
  running: boolean;
}

function latestRun(runs: SubRunView[]): SubRunView {
  return [...runs].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt)).at(-1)!;
}

export function rowLine(run: SubRunView): string {
  if (run.missing) return "这次执行的记录缺失";
  if (run.inline) return "已送入当前执行";
  if (run.outcome === "running" || run.outcome === "stopping") return run.liveAction || "正在处理";
  if (run.outcome === "stopped" || run.outcome === "interrupted") return "未收到最终返回";
  if (run.outcome === "failed") return (run.error ?? "失败").split("\n")[0]!;
  if (run.outcome === "returned") return run.results.map(result => result.title).join("、") || "已交回";
  if (run.outcome === "replied") return run.lastMessage || "已回复";
  return "未交回成果";
}

export function subtaskRows(runs: SubRunView[]): SubRow[] {
  const groups = new Map<string, SubRunView[]>();
  for (const run of runs) {
    const list = groups.get(run.agentId) ?? [];
    list.push(run);
    groups.set(run.agentId, list);
  }
  const rows = [...groups.entries()].map(([agentId, list]) => {
    const first = [...list].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))[0]!;
    const latest = latestRun(list);
    const activeAt = Date.parse(latest.endedAt ?? latest.startedAt) || 0;
    return {
      agentId,
      title: first.title?.trim() || `${agentId}（未写任务说明）`,
      continued: list.filter(run => run.continued).length,
      line: rowLine(latest),
      outcome: latest.outcome,
      label: OUTCOME_LABEL[latest.outcome],
      activeAt,
      running: latest.outcome === "running" || latest.outcome === "stopping",
    };
  });
  return rows.sort((a, b) => Number(b.running) - Number(a.running) || b.activeAt - a.activeAt || a.agentId.localeCompare(b.agentId));
}

export function subtaskEntryLabel(runs: SubRunView[], options: { runningCardsVisible: boolean; connected?: boolean }): string {
  const rows = subtaskRows(runs);
  if (!rows.length) return "";
  const running = rows.filter(row => row.running);
  const failed = rows.filter(row => row.outcome === "failed").length;
  if (options.runningCardsVisible) return `子任务 ${rows.length}`;
  const fail = failed ? ` · ${failed} 个失败` : "";
  if (running.length === 1) {
    const action = running[0]!.line;
    const prefix = options.connected === false ? "最后已知 · " : "";
    return `${running[0]!.agentId} ${prefix}${action}${fail}`;
  }
  if (running.length > 1) return `${options.connected === false ? "最后已知 · " : ""}${running.length} 个子任务进行中${fail}`;
  if (failed) return `${failed} 个子任务失败`;
  return `子任务 ${rows.length}`;
}

export interface PanelSection {
  id: string;
  agentId: string;
  continued: boolean;
  title: string;
  instruction: string;
  items: ProcessItem[];
  results: SubRunView["results"];
  outcome: RunOutcome;
  conclusion?: string;
  call?: SubRunView["call"];
  liveLabel?: string;
  startedAt: string;
}

export function runConclusion(run: SubRunView): string | undefined {
  if (run.missing) return "这次执行的记录缺失";
  if (run.inline) return "已送入当前执行，成果记在原来的卡片上";
  if (run.outcome === "failed") return `执行失败：${(run.error ?? "未提供错误原文").split("\n")[0]}`;
  if (run.outcome === "stopped" || run.outcome === "interrupted") return "未收到最终返回";
  return undefined;
}

export function panelSections(agentId: string, runs: SubRunView[], status: RunStatus, connected = true): PanelSection[] {
  return runs.filter(run => run.agentId === agentId).sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt) || a.round - b.round).map(run => ({
    id: run.dispatchCallId ?? `${run.agentId}:${run.round}`,
    agentId: run.agentId,
    continued: run.continued,
    title: run.title?.trim() || `${run.agentId}（未写任务说明）`,
    instruction: run.instruction,
    items: run.items,
    results: run.results,
    outcome: run.outcome,
    conclusion: runConclusion(run),
    call: run.call,
    startedAt: run.startedAt,
    ...(run.outcome === "running" || run.outcome === "stopping" ? { liveLabel: !connected ? "连接断开，最新进展尚未确认" : status === "stopping" || run.outcome === "stopping" ? "正在停止" : "正在处理" } : {}),
  }));
}

export function elapsedClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
