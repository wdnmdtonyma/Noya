import type { AppSnapshot, DraftView, PageCommand, TaskRef, TaskView } from "../src/local-contract.js";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = $<HTMLTextAreaElement>("message");
const dialog = $<HTMLDialogElement>("dialog");
const feed = $("feed");
const reader = $("reader");
let snapshot: AppSnapshot = { works: [], active: null, task: null };
let workId = readStorage("noya.work") ?? "";
let connected = false;
let sending = false;
let generation = 0;
let reading: (DraftView & { markdown: string }) | undefined;
let reference: string | undefined;
let opener: HTMLElement | null = null;
let readerOpener: HTMLElement | null = null;
let toastTimer: ReturnType<typeof setTimeout>;
let renderedTask = "";
let decisionId = "";
let selectionResolved = false;
let taskReadError = false;
class ResponseError extends Error { status: number; constructor(status: number, text: string) { super(text); this.status = status; } }
const messageNodes = new Map<string, HTMLElement>();
const labels: Record<string, string> = { idle: "可以继续聊聊", running: "正在处理", stopping: "正在停止…", stopped: "已停止 · 记录已保留", interrupted: "上次执行已中断", failed: "本轮未完成" };
const roles: Record<string, string> = { writer: "Writing Agent", reviewer: "正文检查员", sync_checker: "同步核对员" };
const agentStates: Record<string, string> = { running: "正在处理", idle: "本轮完成", stopped: "已停止", retired: "已结束", terminated: "已中断", failed: "失败" };
type CommandAction = { [K in PageCommand["kind"]]: Omit<Extract<PageCommand, { kind: K }>, keyof TaskRef | "requestId"> }[PageCommand["kind"]];

function readStorage(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
function writeStorage(key: string, value: string): void { try { localStorage.setItem(key, value); } catch { $("save-hint").textContent = "浏览器未允许保存输入"; } }
function escape(text: string): string { return text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }
function rich(text: string): string {
  // Agent and manuscript text is data, never HTML. No remote media or executable links.
  return text.split(/\n\s*\n/).map(block => {
    const e = escape(block).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
    if (block.startsWith("```")) return `<pre>${escape(block.replace(/^```[^\n]*\n|\n```$/g, ""))}</pre>`;
    const heading = /^(#{1,3})\s+([^\n]+)$/.exec(block);
    if (heading) return `<h${heading[1]!.length}>${escape(heading[2]!)}</h${heading[1]!.length}>`;
    if (/^[-*] /.test(block)) return `<ul>${e.split(/\n(?=[-*] )/).map(line => `<li>${line.replace(/^[-*] /, "")}</li>`).join("")}</ul>`;
    return `<p>${e.replace(/\n/g, "<br>")}</p>`;
  }).join("");
}
function setHTML(id: string, html: string): void { const node = $(id); if (node.dataset.rendered !== html) { node.innerHTML = html; node.dataset.rendered = html; } }
function name(id = workId): string { return snapshot.works.find(w => w.workId === id)?.name ?? "选择作品"; }
function busyElsewhere(): boolean { return !!snapshot.active && snapshot.active.workId !== workId; }
function toast(text: string): void { $("toast").textContent = text; $("toast").hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $("toast").hidden = true; }, 4000); }
async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(path, data === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new ResponseError(response.status, result.error ?? "本机服务处理失败");
  return result as T;
}
function connection(ok: boolean, error?: string): void {
  connected = ok;
  $("connection").classList.toggle("offline", !ok);
  $("connection").querySelector("span")!.textContent = ok ? "本机已连接" : "连接中断";
  $("connection-error").hidden = ok;
  if (!ok) $("connection-error").textContent = `无法连接本机服务。${error ?? "请确认 Noya 仍在运行。"} 页面会自动重连，已有输入仍保留。`;
  updateComposer();
}
async function refresh(): Promise<void> {
  const current = generation;
  try {
    const next = await api<AppSnapshot>(`/api/state${workId ? `?work=${encodeURIComponent(workId)}` : ""}`);
    if (current !== generation) return;
    snapshot = next; taskReadError = false; connection(true);
    if (!selectionResolved) {
      selectionResolved = true;
      if (!workId && next.works.length === 1 && !next.works[0]!.error) { await selectWork(next.works[0]!.workId); return; }
      if (!workId && next.works.length > 1) chooseWork();
    }
    render();
  } catch (error) {
    if (current !== generation) return;
    // Invalid previous selection must not hide the remaining works.
    if (workId && !selectionResolved) {
      selectionResolved = true; workId = ""; generation += 1;
      toast(error instanceof Error ? error.message : "上次作品无法读取，请选择其他作品");
      await refresh(); chooseWork(); return;
    }
    if (error instanceof ResponseError) {
      taskReadError = true; connection(true); $("task-error").hidden = false; $("task-error").textContent = error.message; updateComposer();
    } else connection(false, error instanceof Error ? error.message : undefined);
  }
}
async function poll(): Promise<void> { await refresh(); setTimeout(() => void poll(), document.hidden ? 1500 : 650); }
function persistInput(): void {
  if (!workId) return;
  writeStorage(`noya.input.${workId}`, input.value);
  writeStorage(`noya.reference.${workId}`, reference ?? "");
}
async function selectWork(id: string): Promise<void> {
  persistInput(); closeReader(false); generation += 1; workId = id; writeStorage("noya.work", id);
  input.value = readStorage(`noya.input.${id}`) ?? "";
  reference = readStorage(`noya.reference.${id}`) || undefined;
  snapshot.task = null; renderedTask = ""; messageNodes.clear(); $("messages").replaceChildren();
  for (const id of ["stream", "execution", "decision", "sync-notice", "task-error"]) $(id).hidden = true;
  $("task-title").textContent = "正在读取任务…"; $("work-name").textContent = name();
  updateComposer(); await refresh();
  const savedReader = readStorage(`noya.reader.${id}`);
  if (savedReader && (snapshot.task as TaskView | null)?.drafts.some(d => d.draftId === savedReader)) await openDraft(savedReader, false);
}
function render(): void {
  $("work-name").textContent = name();
  const task = snapshot.task;
  $("create-first").hidden = !!task || snapshot.works.length > 0;
  $<HTMLButtonElement>("create-first").disabled = !!snapshot.configurationError;
  if (snapshot.configurationError) { $("connection-error").hidden = false; $("connection-error").textContent = snapshot.configurationError; }
  $("empty").hidden = !!task?.messages.length;
  $("composer-area").hidden = !task;
  $("empty-hint").innerHTML = task ? "一个人物、一场相遇，或还没想清楚的念头。<br>和 Noya 聊聊，让故事慢慢有形。" : snapshot.works.length ? "选择一部作品，接着上次的想法继续。" : "一个人物、一场相遇，或还没想清楚的念头。<br>不必准备完美，先为它留下一页。";
  $("active-notice").hidden = !busyElsewhere();
  if (busyElsewhere()) setHTML("active-notice", `<span><i class="pulse"></i> ${escape(name(snapshot.active!.workId))} 仍在执行。当前作品可以阅读。</span><button class="quiet-button" data-action="return-active">返回任务 ↗</button><button class="quiet-button" data-action="stop-active">停止该任务</button>`);
  if (!task) { $("task-title").textContent = "从一个念头开始"; updateComposer(); return; }
  $("task-title").textContent = task.messages.length ? "让故事继续" : "从一个念头开始";
  $("task-status").textContent = busyElsewhere() ? "仅查看 · 输入会保留" : task.decision && task.status === "idle" ? "等待你的决定" : labels[task.status]!;
  if (renderedTask !== task.taskId) { renderedTask = task.taskId; messageNodes.clear(); $("messages").replaceChildren(); decisionId = ""; }
  const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 100;
  let changed = false;
  for (const message of task.messages) {
    let node = messageNodes.get(message.id);
    if (!node) { node = document.createElement("section"); node.className = `message ${message.role}`; messageNodes.set(message.id, node); $("messages").append(node); changed = true; }
    let html = "";
    if (message.role === "notice" && message.draftId) {
      const draft = task.drafts.find(d => d.draftId === message.draftId);
      if (draft) html = draftCard(draft);
    } else html = `<div class="message-label">${message.role === "user" ? "你" : message.role === "notice" ? "本机服务" : "CONTEXT AGENT"}${message.draftId ? ` · ${escape(task.drafts.find(d => d.draftId === message.draftId)?.title ?? "正文")} · 第 ${task.drafts.find(d => d.draftId === message.draftId)?.version ?? "?"} 版` : ""}</div><div class="message-body">${message.role === "user" ? escape(message.text) : rich(message.text)}</div>`;
    if (node.innerHTML !== html) { node.innerHTML = html; changed = true; }
  }
  $("stream").hidden = !task.streaming;
  if ($("stream").textContent !== (task.streaming ?? "")) { $("stream").textContent = task.streaming ?? ""; changed = true; }
  renderExecution(task);
  $("task-error").hidden = !task.error;
  $("task-error").textContent = task.error ?? "";
  $("sync-notice").hidden = !task.pendingChapters.length;
  if (task.pendingChapters.length) setHTML("sync-notice", `<span>正文已定稿 · ${task.pendingChapters.length} 章资料待同步</span><button class="quiet-button" data-action="continue" ${snapshot.active ? "disabled" : ""}>继续同步 →</button>`);
  $("decision").hidden = !task.decision;
  if (task.decision && task.decision.id !== decisionId) {
    decisionId = task.decision.id;
    setHTML("decision", `<span class="eyebrow">需要你的决定</span><h3>${escape(task.decision.title)}</h3><pre>${escape(task.decision.detail)}</pre><div class="decision-actions">${task.decision.options.map((o,i) => `<button class="${i ? "secondary" : "primary"}" data-decision="${i}">${escape(o)}</button>`).join("")}</div>`);
  }
  $("decision").querySelectorAll<HTMLButtonElement>("button").forEach(b => { b.disabled = !!snapshot.active || sending || !connected; });
  if (reading) {
    const current = task.drafts.find(d => d.draftId === reading!.draftId);
    if (current) { reading = { ...reading, ...current }; renderReader(); }
  }
  updateComposer();
  if (changed) { if (atBottom) scrollBottom(); else $("new-content").hidden = false; }
}
function draftCard(draft: DraftView): string {
  return `<button class="draft-card" data-draft="${escape(draft.draftId)}"><span class="draft-card-top">正文 · 第 ${draft.version} 版 <span class="badge ${draft.review === "passed" ? "" : "warn"}">${draft.finalized ? "已定稿" : draft.review === "pending" ? "已保存 · 待检查" : "初稿"}</span></span><h3>${escape(draft.title)}</h3><span class="draft-card-bottom"><span>${draft.characters.toLocaleString()} 字 · ${draft.review === "passed" ? "四项检查通过" : draft.review === "pending" ? "检查尚未完成" : draft.review === "verification" ? "检查含核实记录" : "检查发现内容冲突"}</span><strong>阅读全文 ↗</strong></span></button>`;
}
function renderExecution(task: TaskView): void {
  $("execution").hidden = !task.agents.length && task.status !== "running" && task.status !== "stopping";
  const running = task.agents.filter(a => a.status === "running");
  const summary = task.status === "stopping" ? "正在停止全部执行，等待确认结束" : running.length ? running.map(a => `${roles[a.role]}正在处理`).join(" · ") : task.status === "running" ? task.activity ?? "Context Agent 正在处理" : `${task.agents.length} 条 Agent 工作记录`;
  if (!$("execution").querySelector("details")) $("execution").innerHTML = '<details><summary id="execution-summary"></summary><div id="execution-rows"></div></details>';
  setHTML("execution-summary", `${task.status === "running" ? '<i class="pulse"></i>' : ""}${escape(summary)}`);
  setHTML("execution-rows", task.agents.map(a => `<div class="agent-row"><span>${escape(roles[a.role] ?? a.role)}</span><span>${escape(agentStates[a.status] ?? a.status)}</span><small>${escape(a.detail)}</small></div>`).join(""));
}
function updateComposer(): void {
  const task = snapshot.task;
  const locked = !connected || taskReadError || !task || sending || busyElsewhere() || task.status === "stopping";
  $<HTMLButtonElement>("send").disabled = locked || !input.value.trim();
  input.disabled = !task;
  $("stop").hidden = !snapshot.active || snapshot.active.workId !== workId;
  $<HTMLButtonElement>("stop").disabled = sending || task?.status === "stopping" || !connected;
  $("composer-meta").textContent = busyElsewhere() ? "另一部作品正在执行；输入会为你保留" : task?.status === "running" ? "可以补充意见，Noya 会在当前任务中处理" : "与你一起，把故事写下去";
  $("reference").hidden = !reference;
  const draft = task?.drafts.find(d => d.draftId === reference);
  if (reference) setHTML("reference", `<span>针对《${escape(draft?.title ?? "已保存正文")}》第 ${draft?.version ?? "?"} 版提出意见</span><button class="quiet-button" data-action="clear-reference" aria-label="取消稿件引用">×</button>`);
}
function scrollBottom(): void { feed.scrollTop = feed.scrollHeight; $("new-content").hidden = true; }
async function send(action: CommandAction, target?: TaskRef): Promise<boolean> {
  const task = target ?? snapshot.task;
  if (!task || sending || !connected) return false;
  sending = true; updateComposer();
  const command = { ...action, workId: task.workId, taskId: task.taskId, requestId: crypto.randomUUID() };
  try { await api("/api/command", command); await refresh(); return true; }
  catch (error) {
    await refresh();
    let actual = snapshot.task;
    if (actual?.taskId !== command.taskId) {
      try { actual = (await api<AppSnapshot>(`/api/state?work=${encodeURIComponent(command.workId)}`)).task; } catch { actual = null; }
    }
    const saved = action.kind === "finalize"
      ? actual?.taskId === command.taskId && actual.drafts.some(d => d.draftId === action.draftId && d.finalized)
      : actual?.taskId === command.taskId && actual.messages.some(m => m.id === command.requestId);
    if (saved) { toast("已恢复实际保存结果。"); return true; }
    toast(error instanceof Error ? error.message : "请求结果未知，请查看实际任务状态后再决定。"); return false;
  }
  finally { sending = false; updateComposer(); }
}
async function submit(): Promise<void> {
  const text = input.value.trim();
  if (!text || $<HTMLButtonElement>("send").disabled) return;
  const sentWork = workId; const sentText = input.value;
  const decision = snapshot.task?.decision;
  const action: CommandAction = decision && !snapshot.active ? { kind: "decide", decisionId: decision.id, answer: text } : { kind: "message", text, ...(reference ? { draftId: reference } : {}) };
  if (await send(action)) {
    if (workId === sentWork && input.value === sentText) { input.value = ""; reference = undefined; persistInput(); autosize(); updateComposer(); }
    else if (workId !== sentWork && readStorage(`noya.input.${sentWork}`) === sentText) { writeStorage(`noya.input.${sentWork}`, ""); writeStorage(`noya.reference.${sentWork}`, ""); }
    if (workId === sentWork) { scrollBottom(); input.focus(); }
  }
}
function autosize(): void { input.style.height = "auto"; input.style.height = `${Math.min(180, input.scrollHeight)}px`; }
function showDialog(html: string): void { opener = document.activeElement as HTMLElement; $("dialog-body").innerHTML = html; if (!dialog.open) dialog.showModal(); }
function closeDialog(): void { dialog.close(); opener?.focus(); }
function chooseWork(): void {
  showDialog(`<span class="eyebrow">你的故事</span><h2 id="dialog-title">选择一部作品</h2><div class="work-list">${snapshot.works.map(w => `<button class="work-option ${w.workId === workId ? "selected" : ""}" data-work="${escape(w.workId)}"><span>${escape(w.name)}${w.error ? `<small><br>${escape(w.error)}</small>` : ""}</span><small>${w.workId === snapshot.active?.workId ? "执行中" : w.workId === workId ? "当前" : "↗"}</small></button>`).join("")}</div><button class="secondary" data-action="create">＋ 新建作品</button><div class="dialog-actions"><button class="quiet-button" data-action="close-dialog">关闭</button></div>`);
}
async function create(): Promise<void> {
  const button = dialog.querySelector<HTMLButtonElement>('[data-action="create"]') ?? $<HTMLButtonElement>("create-first");
  button.disabled = true;
  try { const result = await api<{ workId: string }>("/api/works", {}); closeDialog(); await selectWork(result.workId); input.focus(); }
  catch (error) { toast(error instanceof Error ? error.message : "新建失败"); }
  finally { button.disabled = false; }
}
async function openDraft(id: string, focus = true): Promise<void> {
  const task = snapshot.task; const current = generation;
  if (!task) return;
  try {
    const draft = await api<DraftView & { markdown: string }>(`/api/draft?work=${encodeURIComponent(task.workId)}&task=${encodeURIComponent(task.taskId)}&draft=${encodeURIComponent(id)}`);
    if (current !== generation) return;
    readerOpener = document.activeElement as HTMLElement; reading = draft; reader.hidden = false;
    writeStorage(`noya.reader.${workId}`, id); $("reader-content").innerHTML = rich(draft.markdown); reader.querySelector(".reader-scroll")!.scrollTop = 0;
    renderReader(); responsiveReader(); if (focus) $("close-reader").focus();
  } catch (error) { toast(error instanceof Error ? error.message : "无法读取正文"); }
}
function renderReader(): void {
  if (!reading) return;
  setHTML("reader-meta", `<span>${escape(name())}</span><span>第 ${reading.version} 版 · ${reading.characters.toLocaleString()} 字</span>${reading.finalized ? '<span class="badge">已定稿</span>' : ""}`);
  $("review-label").textContent = reading.review === "passed" ? "✓ 四项内容检查通过 · 展开结论" : reading.review === "pending" ? "检查尚未完成" : reading.review === "verification" ? "检查含核实记录 · 结合交稿说明阅读" : "检查发现内容冲突 · 展开结论";
  $("review-content").textContent = reading.reviewText;
  $<HTMLButtonElement>("finalize").disabled = !connected || !!snapshot.active || reading.finalized || sending;
  $("finalize").textContent = reading.finalized ? "本版已定稿" : "将这版定稿";
}
function closeReader(clear = true): void {
  reader.hidden = true; reading = undefined; $("task-pane").inert = false; $("app").querySelector<HTMLElement>(".app-header")!.inert = false;
  $("active-notice").inert = false; $("connection-error").inert = false;
  reader.removeAttribute("role"); reader.removeAttribute("aria-modal"); if (clear && workId) writeStorage(`noya.reader.${workId}`, ""); readerOpener?.focus();
}
function responsiveReader(): void {
  const modal = !reader.hidden && matchMedia("(max-width: 780px)").matches;
  $("task-pane").inert = modal; $("app").querySelector<HTMLElement>(".app-header")!.inert = modal;
  $("active-notice").inert = modal; $("connection-error").inert = modal;
  if (modal) { reader.setAttribute("role", "dialog"); reader.setAttribute("aria-modal", "true"); } else { reader.removeAttribute("role"); reader.removeAttribute("aria-modal"); }
}
function confirmFinalize(): void {
  const draft = reading; if (!draft || !snapshot.task) return;
  const target = { workId, taskId: snapshot.task.taskId };
  showDialog(`<span class="eyebrow">将故事落定</span><h2 id="dialog-title">确认这一版正文</h2><p>${escape(name())}<br><strong>《${escape(draft.title)}》 · 第 ${draft.version} 版</strong><br>${draft.replaces ? "将替换该章已有的正式正文。旧稿仍可阅读。" : "这份正文将成为作品的正式内容。"}<br>${draft.review !== "passed" ? "请结合本版检查记录与交稿说明，确认你接受这份正文。<br>" : ""}正文保存后，Noya 会继续整理资料。</p><div class="dialog-actions"><button class="secondary" data-action="close-dialog">再读一读</button><button id="confirm-finalize" class="primary">确认定稿</button></div>`);
  $("confirm-finalize").onclick = async () => { $<HTMLButtonElement>("confirm-finalize").disabled = true; closeDialog(); if (await send({ kind: "finalize", draftId: draft.draftId, fingerprint: draft.fingerprint, confirmed: true }, target)) toast("正文已定稿，资料同步会继续进行。"); };
}
function confirmStop(): void {
  const target = snapshot.active; if (!target) return;
  showDialog(`<h2 id="dialog-title">停止当前任务？</h2><p>${escape(name(target.workId))}<br>停止这次讨论、写作或检查。已经保存的对话和正文会保留，之后可以继续。</p><div class="dialog-actions"><button class="secondary" data-action="close-dialog">继续等待</button><button id="confirm-stop" class="primary">停止执行</button></div>`);
  $("confirm-stop").onclick = async () => { closeDialog(); await send({ kind: "stop" }, target); };
}

$("composer").addEventListener("submit", event => { event.preventDefault(); void submit(); });
input.addEventListener("input", () => { persistInput(); autosize(); updateComposer(); });
input.addEventListener("keydown", event => { if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); void submit(); } });
$("work-switcher").onclick = chooseWork; $("create-first").onclick = () => void create();
$("close-reader").onclick = () => closeReader(); $("stop").onclick = confirmStop; $("finalize").onclick = confirmFinalize;
$("revise").onclick = () => { if (!reading) return; reference = reading.draftId; persistInput(); closeReader(); updateComposer(); input.focus(); };
$("new-content").onclick = scrollBottom;
feed.addEventListener("scroll", () => { if (feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80) $("new-content").hidden = true; });
dialog.addEventListener("close", () => opener?.focus());
dialog.addEventListener("click", event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeDialog(); } });
document.addEventListener("click", event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button"); if (!button || button.disabled) return;
  if (button.dataset.work) { closeDialog(); void selectWork(button.dataset.work); }
  if (button.dataset.draft) void openDraft(button.dataset.draft);
  if (button.dataset.decision !== undefined && snapshot.task?.decision) { const d = snapshot.task.decision; void send({ kind: "decide", decisionId: d.id, answer: d.options[Number(button.dataset.decision)] }); }
  const action = button.dataset.action;
  if (action === "close-dialog") closeDialog();
  if (action === "create") void create();
  if (action === "clear-reference") { reference = undefined; persistInput(); updateComposer(); input.focus(); }
  if (action === "continue") void send({ kind: "continue" });
  if (action === "return-active" && snapshot.active) void selectWork(snapshot.active.workId);
  if (action === "stop-active") confirmStop();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !dialog.open && !reader.hidden) { event.preventDefault(); closeReader(); }
  if (event.key === "Tab" && !reader.hidden && matchMedia("(max-width: 780px)").matches && !dialog.open) {
    const items = [...reader.querySelectorAll<HTMLElement>('button:not(:disabled),summary,[tabindex="0"]')];
    if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
    if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
  }
});
window.addEventListener("resize", responsiveReader);
window.addEventListener("online", () => void refresh());
window.addEventListener("pagehide", persistInput);
if (workId) { input.value = readStorage(`noya.input.${workId}`) ?? ""; reference = readStorage(`noya.reference.${workId}`) || undefined; }
void (async () => { await refresh(); const saved = readStorage(`noya.reader.${workId}`); if (saved && snapshot.task?.drafts.some(d => d.draftId === saved)) await openDraft(saved, false); setTimeout(() => void poll(), 650); })();
