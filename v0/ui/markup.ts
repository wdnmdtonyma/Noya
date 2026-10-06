import type { ProcessItem, RunStatus, SubRunView } from "../src/local-contract.ts";
import { OUTCOME_LABEL, activitySummary, deriveTurns, livePhrase, panelSections, subtaskRows, type FeedBlock, type PanelSection } from "./feed.js";

export function escapeText(text: string): string {
  return text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

function rawText(value: unknown): string {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value, null, 2) ?? ""; } catch { return String(value); }
}

function toolLine(item: Extract<ProcessItem, { kind: "tool" }>): string {
  const phrase = livePhrase(item).replace(/^正在/, "");
  if (item.state === "error" || item.error) return `${phrase}失败`;
  if (item.state === "stopped") return `${phrase}已停止`;
  if (item.state === "interrupted") return `${phrase}未完成`;
  if (item.state === "running") return livePhrase(item);
  if (/No changes applied/i.test(`${item.output ?? ""}\n${item.result ?? ""}`)) return `未改动 ${phrase.replace(/^修改\s*/, "")}`.trim();
  return phrase;
}

function detail(item: ProcessItem, open: boolean): string {
  if (!open) return "";
  if (item.kind === "thinking") {
    return `<div class="detail-body">${item.unreadable ? "思考 · 内容不可读" : `<pre>${escapeText(item.text ?? "")}</pre>`}</div>`;
  }
  if (item.kind === "tool") {
    const output = item.output ? `<div class="detail-label">执行中输出</div><pre>${escapeText(item.output)}</pre>` : "";
    const result = item.state === "running" ? "" : `<div class="detail-label">最终返回</div><pre>${escapeText(item.result ?? "")}</pre>`;
    const missing = item.state === "stopped" || item.state === "interrupted" ? `<p class="detail-note">${item.state === "stopped" ? "已停止" : "已中断"}，未收到最终返回</p>` : "";
    return `<div class="detail-body"><div class="detail-label">原工具名</div><code>${escapeText(item.name)}</code><div class="detail-label">参数</div><pre>${escapeText(rawText(item.args))}</pre>${output}${result}${item.error && item.result ? `<div class="detail-label">错误</div><pre>${escapeText(item.result)}</pre>` : ""}${missing}</div>`;
  }
  if (item.kind === "unknown") return `<div class="detail-body"><div class="detail-label">${escapeText(item.type)}</div><pre>${escapeText(item.raw ?? "")}</pre></div>`;
  if (item.kind === "event") return `<div class="detail-body"><pre>${escapeText(item.text)}</pre></div>`;
  return "";
}

function row(item: ProcessItem, expanded: Set<string>): string {
  const open = expanded.has(item.id);
  if (item.kind === "thinking") {
    const label = item.unreadable ? "思考 · 内容不可读" : "思考";
    return `<div class="activity-row"><button type="button" class="activity-head" data-action="toggle-event" data-event="${escapeText(item.id)}" aria-expanded="${open}">${escapeText(label)}</button>${detail(item, open)}</div>`;
  }
  if (item.kind === "tool") {
    return `<div class="activity-row"><button type="button" class="activity-head" data-action="toggle-event" data-event="${escapeText(item.id)}" aria-expanded="${open}"><span>${escapeText(toolLine(item))}</span><code>${escapeText(item.name)}</code></button>${detail(item, open)}</div>`;
  }
  if (item.kind === "unknown") {
    return `<div class="activity-row"><button type="button" class="activity-head" data-action="toggle-event" data-event="${escapeText(item.id)}" aria-expanded="${open}">${escapeText(item.type)}</button>${detail(item, open)}</div>`;
  }
  return "";
}

const AGENT_MARK = `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M8 8.2a2.6 2.6 0 1 0-2.6-2.6A2.6 2.6 0 0 0 8 8.2Zm0 1.15c-2.35 0-4.3 1.15-4.3 2.55V13h8.6v-1.1c0-1.4-1.95-2.55-4.3-2.55Z"/></svg>`;
const DOC_MARK = `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M4 1.5h5.2L13 5.3V14a.5.5 0 0 1-.5.5h-8A.5.5 0 0 1 4 14Zm5 1.2V5h2.3L9 2.7Z"/></svg>`;

function resultKind(id: string): string {
  if (id.startsWith("review_") || id.startsWith("check_")) return "review";
  if (id.startsWith("plan_")) return "plan";
  return "draft";
}

function resultChips(results: SubRunView["results"]): string {
  if (!results.length) return "";
  return `<div class="task-card-results">${results.map(result => {
    const note = result.readable ? result.finalized ? "作者已定稿" : result.summary : "暂时无法读取";
    const action = result.readable ? `data-action="open-result" data-result="${escapeText(result.artifactId)}"` : `data-action="retry-result" data-result="${escapeText(result.artifactId)}"`;
    return `<button type="button" class="result-chip kind-${resultKind(result.artifactId)}" ${action}><span class="result-chip-icon">${DOC_MARK}</span><span class="result-chip-text"><strong>${escapeText(result.title)}</strong><small>${escapeText(note)}</small></span><span class="result-chip-open">${result.readable ? "阅读 ›" : "重试"}</span></button>`;
  }).join("")}</div>`;
}

function tone(outcome: SubRunView["outcome"]): string {
  if (outcome === "running" || outcome === "stopping") return "running";
  if (outcome === "returned") return "done";
  if (outcome === "failed") return "failed";
  if (outcome === "stopped" || outcome === "interrupted") return "stopped";
  return "idle";
}

function card(run: SubRunView, connected: boolean): string {
  const kicker = run.continued ? `追加要求 · ${run.agentId}` : run.agentId;
  const title = run.title?.trim() || `${run.agentId}（未写任务说明）`;
  const label = OUTCOME_LABEL[run.outcome];
  let note = "";
  if (run.missing) note = "这次执行的记录缺失";
  else if (run.inline) note = "已送入当前执行";
  else if (run.outcome === "running" || run.outcome === "stopping") note = `${connected ? "" : "最后已知 · "}${run.liveAction || "正在处理"}`;
  else if (run.outcome === "failed") note = (run.error ?? "失败").split("\n")[0]!;
  else if (run.outcome === "stopped" || run.outcome === "interrupted") note = "未收到最终返回";
  else if (run.outcome === "replied") note = run.lastMessage ?? "";
  else if (run.outcome === "no-result") note = "未交回成果";
  return `<section class="task-card outcome-${run.outcome}" data-running="${run.outcome === "running" || run.outcome === "stopping" ? "1" : "0"}"><button type="button" class="task-card-head" data-action="open-subtask" data-agent="${escapeText(run.agentId)}" aria-label="查看 ${escapeText(run.agentId)} 的过程：${escapeText(title)}"><span class="agent-tile">${AGENT_MARK}</span><span class="task-card-text"><span class="task-card-kicker">${escapeText(kicker)}</span><strong class="task-card-title">${escapeText(title)}</strong>${note ? `<span class="task-card-note">${escapeText(note)}</span>` : ""}</span><span class="task-card-end"><span class="state-tag tone-${tone(run.outcome)}">${escapeText(label)}</span><span class="task-card-open">过程 ›</span></span></button>${resultChips(run.results)}</section>`;
}

function blockHtml(block: FeedBlock, expanded: Set<string>, connected: boolean, rich: (text: string) => string): string {
  if (block.kind === "card" && block.run) return card(block.run, connected);
  if (block.kind === "message" && block.message) {
    const message = block.message;
    if (message.role === "user") return `<section class="message user"><div class="message-label">你</div><div class="message-body">${escapeText(message.text)}</div></section>`;
    return `<section class="message assistant"><div class="message-label">Main</div><div class="message-body">${rich(message.text)}</div></section>`;
  }
  if (block.kind === "event" && block.event) {
    const open = expanded.has(block.event.id);
    return `<div class="feed-event"><button type="button" data-action="toggle-event" data-event="${escapeText(block.event.id)}" aria-expanded="${open}">${escapeText(block.event.text)}</button>${detail(block.event, open)}</div>`;
  }
  if (block.kind === "unknown" && block.unknown) return row(block.unknown, expanded);
  if (block.kind === "group" && block.items) {
    const open = expanded.has(block.id);
    const summary = block.summary || activitySummary(block.items, { connected });
    return `<section class="process-group"><button type="button" class="process-head" data-action="toggle-group" data-group="${escapeText(block.id)}" aria-expanded="${open}"><span class="process-summary">${escapeText(summary)}</span></button>${open ? `<div class="process-details">${block.items.map(item => row(item, expanded)).join("")}</div>` : ""}</section>`;
  }
  return "";
}

export function renderFeed(process: ProcessItem[], runs: SubRunView[], status: RunStatus, connected: boolean, expandedTurns: Set<string>, expanded: Set<string>, rich: (text: string) => string): string {
  const turns = deriveTurns(process, runs, status, connected);
  return turns.map(turn => {
    const open = turn.running || expandedTurns.has(turn.id);
    const blocks = (open ? turn.blocks : turn.folded).map(block => blockHtml(block, expanded, connected, rich)).join("");
    const user = turn.user ? `<section class="message user"><div class="message-label">你</div><div class="message-body">${escapeText(turn.user.text)}</div></section>` : "";
    const head = turn.running ? "" : `<button type="button" class="turn-head ${turn.abnormal ? `tone-${turn.abnormal}` : ""}" data-action="toggle-turn" data-turn="${escapeText(turn.id)}" aria-expanded="${open}"><span>${escapeText(turn.label)}</span></button>`;
    const live = turn.running ? `<div class="live-tail ${turn.liveFrozen ? "is-offline" : ""}"><span>${escapeText(turn.liveLabel ?? "")}</span>${turn.liveFrozen || turn.liveStart === undefined ? "" : `<time data-start="${turn.liveStart}"></time>`}</div>` : "";
    return `<section class="turn" data-turn-root="${escapeText(turn.id)}">${user}${head}${blocks}${live}</section>`;
  }).join("");
}

export function renderSubtaskList(runs: SubRunView[]): string {
  const rows = subtaskRows(runs).map(rowItem => `<button type="button" class="subtask-row" data-action="open-subtask" data-agent="${escapeText(rowItem.agentId)}"><strong>${escapeText(rowItem.title)}</strong><span class="subtask-row-meta"><code>${escapeText(rowItem.agentId)}</code>${rowItem.continued ? `<span>追加 ${rowItem.continued} 次</span>` : ""}<span>${escapeText(rowItem.line)}</span></span><span class="state-tag">${escapeText(rowItem.label)}</span></button>`).join("");
  return `<div class="subtask-list-head"><strong>子任务</strong><button type="button" data-action="close-subtasks">关闭</button></div>${rows}`;
}

export function renderPanel(agentId: string, runs: SubRunView[], status: RunStatus, connected: boolean, expanded: Set<string>, rich: (text: string) => string): { title: string; meta: string; body: string } {
  const sections = panelSections(agentId, runs, status, connected);
  const latest = sections.at(-1);
  const title = latest?.title || `${agentId}（未写任务说明）`;
  const meta = latest ? `${agentId} · ${OUTCOME_LABEL[latest.outcome]}` : agentId;
  const body = sections.map(section => panelSection(section, expanded, rich)).join("") || `<p class="panel-empty">这个子任务尚无已保存的记录。</p>`;
  return { title, meta, body };
}

function panelSection(section: PanelSection, expanded: Set<string>, rich: (text: string) => string): string {
  const rawId = `raw:${section.id}`;
  const open = expanded.has(rawId);
  const call = section.call;
  const raw = call ? `<button type="button" class="quiet-button" data-action="toggle-event" data-event="${escapeText(rawId)}" aria-expanded="${open}">${open ? "收起原始调用" : "原始调用"}</button>` : "";
  const rawBody = open && call ? `<div class="detail-body"><code>${escapeText(call.name)}</code><pre>${escapeText(rawText(call.args))}</pre>${call.result !== undefined ? `<pre>${escapeText(call.result)}</pre>` : ""}</div>` : "";
  const records = section.items.length ? `<div class="process-details">${section.items.map(item => item.kind === "message" ? `<section class="message assistant"><div class="message-body">${rich(item.text)}</div></section>` : row(item, expanded)).join("")}</div>` : "";
  const results = resultChips(section.results);
  const live = section.liveLabel ? `<div class="live-tail in-panel"><span>${escapeText(section.liveLabel)}</span>${section.liveLabel.startsWith("连接断开") ? "" : `<time data-start="${Date.parse(section.startedAt)}"></time>`}</div>` : "";
  const conclusion = section.conclusion ? `<p class="run-conclusion">${escapeText(section.conclusion)}</p>` : "";
  const instruction = section.instruction ? `<div class="dispatch-text">${rich(section.instruction)}</div>` : `<p class="panel-empty">${escapeText(section.title)}</p>`;
  return `<article class="panel-section"><div class="panel-request"><span>Main ${section.continued ? "追加的要求" : "派发的要求"}</span>${raw}</div>${instruction}${rawBody}${records}${results}${conclusion}${live}</article>`;
}
