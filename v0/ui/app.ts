import type { AppSnapshot, DraftView, PageCommand, TaskRef, TaskView } from "../src/local-contract.js";
import { elapsedClock, subtaskEntryLabel } from "./feed.js";
import { renderFeed, renderPanel, renderSubtaskList } from "./markup.js";
import { deriveSidebar, type SidebarModel, type SidebarTaskRow } from "./sidebar.js";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const input = $<HTMLTextAreaElement>("message");
const dialog = $<HTMLDialogElement>("dialog");
const feed = $("feed");
const reader = $("reader");
let snapshot: AppSnapshot = { works: [], tasks: [], active: null, task: null };
let workId = readTab("noya.work") ?? readStorage("noya.work") ?? "";
let taskId = readTab(`noya.task.${workId}`) ?? readStorage(`noya.task.${workId}`) ?? "";
type Preferences = { input?: string; reference?: string; reader?: string; readerScroll?: number; feedScroll?: number; turns?: string[]; groups?: string[]; events?: string[]; panelAgent?: string; panelScroll?: number; readerFrom?: "feed" | "panel"; artifact?: string };
let preferences: Preferences = {};
let loadingSelection = true;
let creatingTask = false;
let refreshSequence = 0;
let draftSequence = 0;
let connected = false;
const mac = /\bMac|iPhone|iPad|iPod/.test(navigator.userAgent);
let collapsed = readRail();
let drawerOpen = false;
let worksOpen = false;
let tasksOpen = false;
let viewportNarrow = compact();
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
let expandedTurns = new Set<string>();
let expandedGroups = new Set<string>();
let expandedEvents = new Set<string>();
let panelAgent = "";
let panelReturn = "";
let listOpen = false;
let runningVisible = false;
let readerFrom: "feed" | "panel" = "feed";
let textReader: { id: string; title: string; text: string } | undefined;
const labels: Record<string, string> = { idle: "可以继续聊聊", running: "正在处理", stopping: "正在停止…", stopped: "已停止 · 记录已保留", interrupted: "上次执行已中断", failed: "本轮未完成" };
type CommandAction = { [K in PageCommand["kind"]]: Omit<Extract<PageCommand, { kind: K }>, keyof TaskRef | "requestId"> }[PageCommand["kind"]];

function readTab(key: string): string | null { try { return sessionStorage.getItem(key); } catch { return null; } }
function writeTab(key: string, value: string): void { try { sessionStorage.setItem(key, value); } catch { /* Local preferences remain available. */ } }
function preferenceKey(work = workId, task = taskId): string { return `noya.task-state.${work}.${task}`; }
function loadPreferences(): void {
  try { preferences = JSON.parse(readStorage(preferenceKey()) ?? "{}"); } catch { preferences = {}; }
  input.value = preferences.input ?? ""; reference = preferences.reference || undefined;
  expandedTurns = new Set(preferences.turns ?? []); expandedGroups = new Set(preferences.groups ?? []); expandedEvents = new Set(preferences.events ?? []);
  panelAgent = preferences.panelAgent ?? ""; readerFrom = preferences.readerFrom ?? "feed"; panelReturn = readerFrom === "panel" ? panelAgent : "";
  autosize();
}
function compact(): boolean { return matchMedia("(max-width: 780px)").matches; }
function readRail(): boolean { try { return localStorage.getItem("noya.sidebar") === "collapsed"; } catch { return false; } }
function writeRail(value: boolean): void { try { localStorage.setItem("noya.sidebar", value ? "collapsed" : "expanded"); } catch { /* The sidebar stays expanded when storage is unavailable. */ } }
function shortcutLabel(): string { return mac ? "⌘\\" : "Ctrl+\\"; }
function railMode(): boolean { return !compact() && collapsed; }
function readStorage(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
function writeStorage(key: string, value: string): void { try { localStorage.setItem(key, value); } catch { $("save-hint").textContent = "浏览器未允许保存输入"; } }
function escape(text: string): string { return text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }
function rich(text: string): string {
  // Agent and manuscript text is data, never HTML. No remote media or executable links.
  const inline = (value: string) => escape(value).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
  const output: string[] = []; let paragraph: string[] = [], items: string[] = [], code: string[] | undefined;
  const flushParagraph = () => { if (paragraph.length) output.push(`<p>${paragraph.map(inline).join("<br>")}</p>`); paragraph = []; };
  const flushList = () => { if (items.length) output.push(`<ul>${items.map(item => `<li>${inline(item)}</li>`).join("")}</ul>`); items = []; };
  for (const line of text.split("\n")) {
    if (line.startsWith("```")) { flushParagraph(); flushList(); if (code) { output.push(`<pre>${escape(code.join("\n"))}</pre>`); code = undefined; } else code = []; continue; }
    if (code) { code.push(line); continue; }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line), item = /^[-*]\s+(.+)$/.exec(line);
    if (heading) { flushParagraph(); flushList(); output.push(`<h${heading[1]!.length}>${inline(heading[2]!)}</h${heading[1]!.length}>`); }
    else if (item) { flushParagraph(); items.push(item[1]!); }
    else { flushList(); if (line.trim()) paragraph.push(line); else flushParagraph(); }
  }
  flushParagraph(); flushList(); if (code) output.push(`<pre>${escape(code.join("\n"))}</pre>`);
  return output.join("");
}
function setHTML(id: string, html: string): void { const node = $(id); if (node.dataset.rendered !== html) { node.innerHTML = html; node.dataset.rendered = html; } }
function name(id = workId): string { return snapshot.works.find(w => w.workId === id)?.name ?? "选择作品"; }
function busyElsewhere(): boolean { return !!snapshot.active && (snapshot.active.workId !== workId || snapshot.active.taskId !== taskId); }
function toast(text: string): void { $("toast").textContent = text; $("toast").hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $("toast").hidden = true; }, 4000); }
async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(path, data === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new ResponseError(response.status, result.error ?? "本机服务处理失败");
  return result as T;
}
function connection(ok: boolean, error?: string): void {
  const changed = connected !== ok;
  connected = ok;
  $("connection").classList.toggle("offline", !ok);
  $("connection-label").textContent = ok ? "本机已连接" : "连接中断";
  $("connection").dataset.tip = $("connection-label").textContent ?? "";
  $("connection-error").hidden = ok;
  if (!ok) $("connection-error").textContent = `无法连接本机服务。${error ?? "请确认 Noya 仍在运行。"} 页面会自动重连，已有输入仍保留。`;
  updateComposer();
  if (changed && snapshot.task) render();
}
async function refresh(): Promise<void> {
  const current = generation; const sequence = ++refreshSequence;
  try {
    const next = await api<AppSnapshot>(`/api/state${workId ? `?work=${encodeURIComponent(workId)}${taskId ? `&task=${encodeURIComponent(taskId)}` : ""}` : ""}`);
    if (current !== generation || sequence !== refreshSequence) return;
    snapshot = next; taskReadError = !!next.selectionError; connection(true);
    if (next.task && !taskId) { taskId = next.task.taskId; rememberSelection(); }
    if (loadingSelection && next.task) { rememberSelection(); loadPreferences(); migratePreferences(false); }
    if (!selectionResolved) {
      selectionResolved = true;
      if (!workId && next.works.length === 1 && !next.works[0]!.error) { await selectWork(next.works[0]!.workId); return; }
      if (!workId && next.works.length > 1) worksOpen = true;
    }
    render();
    if (loadingSelection && next.task) {
      loadingSelection = false;
      feed.scrollTo({ top: preferences.feedScroll ?? feed.scrollHeight, behavior: "instant" });
      if (preferences.reader && next.task.drafts.some(d => d.draftId === preferences.reader)) await openDraft(preferences.reader, false);
      else if (preferences.artifact) await openText(preferences.artifact);
    }
  } catch (error) {
    if (current !== generation || sequence !== refreshSequence) return;
    // Invalid previous selection must not hide the remaining works.
    if (workId && !taskId && !selectionResolved) {
      selectionResolved = true; workId = ""; generation += 1;
      toast(error instanceof Error ? error.message : "上次作品无法读取，请选择其他作品");
      await refresh(); worksOpen = true; render(); return;
    }
    if (error instanceof ResponseError) {
      taskReadError = true; snapshot.task = null; connection(true);
      try { const overview = await api<AppSnapshot>(`/api/state?work=${encodeURIComponent(workId)}`); if (current !== generation) return; snapshot.works = overview.works; snapshot.tasks = overview.tasks; snapshot.active = overview.active; snapshot.activeName = overview.activeName; } catch { /* Preserve the selected identity and original error. */ }
      snapshot.selectionError = error.message; render();
    } else connection(false, error instanceof Error ? error.message : undefined);
  }
}
async function poll(): Promise<void> { await refresh(); setTimeout(() => void poll(), document.hidden ? 1500 : 650); }
function persistInput(): void {
  if (!workId || !taskId || loadingSelection) return;
  const panelScroll = $("panel-scroll");
  preferences = { ...preferences, input: input.value, reference: reference ?? "", feedScroll: feed.scrollTop,
    turns: [...expandedTurns], groups: [...expandedGroups], events: [...expandedEvents], panelAgent, readerFrom,
    ...(panelAgent && panelScroll ? { panelScroll: panelScroll.scrollTop } : {}),
    ...(!reader.hidden && reading ? { reader: reading.draftId, readerScroll: reader.querySelector(".reader-scroll")!.scrollTop } : {}),
    ...(!reader.hidden && textReader ? { artifact: textReader.id, readerScroll: reader.querySelector(".reader-scroll")!.scrollTop } : {}) };
  writeStorage(preferenceKey(), JSON.stringify(preferences));
}
function rememberSelection(): void {
  writeStorage("noya.work", workId); writeTab("noya.work", workId);
  writeStorage(`noya.task.${workId}`, taskId); writeTab(`noya.task.${workId}`, taskId);
}
async function selectWork(id: string, selected?: string): Promise<void> {
  closeOverlays(selected !== undefined); persistInput(); readerFrom = "feed"; panelReturn = ""; closeReader(false); generation += 1; workId = id;
  taskId = selected ?? readTab(`noya.task.${id}`) ?? readStorage(`noya.task.${id}`) ?? "";
  rememberSelection(); loadingSelection = true; taskReadError = false;
  input.value = ""; reference = undefined; preferences = {};
  snapshot.task = null; snapshot.tasks = []; snapshot.selectionError = undefined; renderedTask = ""; panelAgent = ""; panelReturn = ""; listOpen = false; readerFrom = "feed"; textReader = undefined; $("messages").replaceChildren(); $("messages").dataset.rendered = ""; $("panel").hidden = true;
  for (const id of ["stream", "execution", "decision", "sync-notice", "task-error", "legacy-notice", "new-content"]) $(id).hidden = true;
  $("task-title").textContent = "正在读取任务…"; $("work-name").textContent = name();
  updateComposer(); await refresh();
}
function migratePreferences(confirmed: boolean): void {
  const key = `noya.migrated.${workId}`;
  if (readStorage(key) || !snapshot.task) return;
  const legacy = { input: readStorage(`noya.input.${workId}`) ?? "", reference: readStorage(`noya.reference.${workId}`) ?? "", reader: readStorage(`noya.reader.${workId}`) ?? "" };
  if (!Object.values(legacy).some(Boolean)) { writeStorage(key, "empty"); return; }
  const refsValid = [legacy.reference, legacy.reader].filter(Boolean).every(id => snapshot.task!.drafts.some(d => d.draftId === id));
  if ((!confirmed && (snapshot.tasks.length !== 1 || !refsValid)) || (confirmed && !refsValid)) {
    $("legacy-notice").hidden = false;
    setHTML("legacy-notice", `<div><strong>上次的输入仍为你保留</strong><p>${escape(legacy.input || "保留了稿件引用与阅读位置")}<br>旧记录没有任务身份，请在原任务中确认归属。${!refsValid ? "当前任务没有对应稿件，请先切换任务。" : ""}</p></div><button class="secondary" data-action="migrate" ${!refsValid ? "disabled" : ""}>归入当前任务</button>`);
    return;
  }
  preferences = { ...preferences, input: [preferences.input, legacy.input].filter(Boolean).join("\n"), reference: preferences.reference || legacy.reference, reader: preferences.reader || legacy.reader };
  writeStorage(preferenceKey(), JSON.stringify(preferences));
  if (readStorage(preferenceKey()) === JSON.stringify(preferences)) writeStorage(key, taskId);
  input.value = preferences.input ?? ""; reference = preferences.reference || undefined; $("legacy-notice").hidden = true; autosize();
}
function render(): void {
  paintSidebar();
  const task = snapshot.task;
  $("create-first").hidden = !!task || snapshot.works.length > 0;
  $<HTMLButtonElement>("create-first").disabled = !!snapshot.configurationError;
  if (snapshot.configurationError) { $("connection-error").hidden = false; $("connection-error").textContent = snapshot.configurationError; }
  const started = !!task?.messages.some(message => message.role === "user") || !!task?.process.some(item => item.kind === "message");
  $("empty").hidden = started;
  $("composer-area").hidden = !task;
  $("empty-hint").innerHTML = task ? "告诉 Main 这一章想怎么写" : snapshot.works.length ? "选择一部作品，接着上次的想法继续。" : "一个人物、一场相遇，或还没想清楚的念头。<br>不必准备完美，先为它留下一页。";
  $("active-notice").hidden = !busyElsewhere();
  if (busyElsewhere()) setHTML("active-notice", `<span><i class="pulse"></i> ${escape(name(snapshot.active!.workId))} · ${escape(snapshot.activeName ?? snapshot.active!.taskId)} 仍在执行。你可以继续阅读。</span><button class="quiet-button" data-action="return-active">返回任务 ↗</button><button class="quiet-button" data-action="stop-active">停止该任务</button>`);
  if (!task) {
    $("task-title").textContent = snapshot.selectionError ? "这条任务暂时无法读取" : "从一个念头开始";
    $("task-status").textContent = "";
    $("task-error").hidden = !snapshot.selectionError; $("task-error").textContent = snapshot.selectionError ?? "";
    $("empty").hidden = !!snapshot.selectionError; updateComposer(); return;
  }
  $("task-title").textContent = task.name;
  $("task-title").title = task.name;
  $("task-status").textContent = busyElsewhere() ? "仅查看 · 输入会保留" : task.status === "running" ? "" : task.decision && task.status === "idle" ? "等待你的决定" : labels[task.status]!;
  if (renderedTask !== `${workId}/${task.taskId}`) { renderedTask = `${workId}/${task.taskId}`; $("messages").replaceChildren(); $("messages").dataset.rendered = ""; decisionId = ""; listOpen = false; if (panelAgent && !task.runs.some(run => run.agentId === panelAgent)) panelAgent = ""; }
  const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 100;
  const feedHtml = renderFeed(task.process, task.runs, task.status, connected, expandedTurns, new Set([...expandedGroups, ...expandedEvents]), rich);
  const changed = $("messages").dataset.rendered !== feedHtml;
  if (changed) { $("messages").innerHTML = feedHtml; $("messages").dataset.rendered = feedHtml; tickClocks(); }
  $("stream").hidden = true;
  $("execution").hidden = true;
  paintEntry(task);
  paintPanel(task);
  $("task-error").hidden = !task.error;
  $("task-error").textContent = task.error ?? "";
  $("sync-notice").hidden = !task.pendingChapters.length;
  if (task.pendingChapters.length) setHTML("sync-notice", `<strong>正文已定稿 · ${task.pendingChapters.length} 章资料待同步</strong>${task.pendingSync.map(p => `<div class="sync-row"><span>《${escape(p.title)}》<small>${p.error ? escape(p.error) : p.owner ? `由「${escape(p.ownerName ?? p.owner.taskId)}」继续处理${p.owner.taskId === taskId ? " · 当前任务" : ""}` : "旧记录尚未关联任务，需要你明确承接"}</small></span>${p.error ? "" : p.owner ? p.owner.taskId === taskId ? `<button class="quiet-button" data-action="continue" ${snapshot.active ? "disabled" : ""}>继续同步 →</button>` : `<button class="quiet-button" data-task="${escape(p.owner.taskId)}">返回同步任务 ↗</button>` : `<button class="quiet-button" data-claim="${escape(p.chapterId)}" ${snapshot.active ? "disabled" : ""}>在此承接同步</button>`}</div>`).join("")}`);
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
function paintEntry(task: TaskView): void {
  const anchor = $("subtask-anchor");
  if (!task.runs.length) { anchor.hidden = true; listOpen = false; return; }
  anchor.hidden = false;
  const label = subtaskEntryLabel(task.runs, { runningCardsVisible: runningVisible, connected });
  const entryLabel = $("subtask-entry");
  if (entryLabel.textContent !== label) entryLabel.innerHTML = `<span>${escape(label)}</span>`;
  $("subtask-entry").setAttribute("aria-expanded", String(listOpen));
  $("subtask-list").hidden = !listOpen;
  if (listOpen) setHTML("subtask-list", renderSubtaskList(task.runs));
  const cards = [...document.querySelectorAll<HTMLElement>(`.task-card[data-running="1"]`)];
  const box = feed.getBoundingClientRect();
  const visible = cards.some(card => { const rect = card.getBoundingClientRect(); return rect.bottom > box.top + 8 && rect.top < box.bottom - 8; });
  if (visible !== runningVisible) { runningVisible = visible; const next = subtaskEntryLabel(task.runs, { runningCardsVisible: runningVisible, connected }); if (entryLabel.textContent !== next) entryLabel.innerHTML = `<span>${escape(next)}</span>`; }
}
function paintPanel(task: TaskView): void {
  const panel = $("panel");
  if (!panelAgent || !reader.hidden) {
    panel.hidden = true;
    if (reader.hidden) syncInert();
    return;
  }
  if (!task.runs.some(run => run.agentId === panelAgent)) { panelAgent = ""; panel.hidden = true; return; }
  panel.hidden = false;
  const view = renderPanel(panelAgent, task.runs, task.status, connected, new Set([...expandedGroups, ...expandedEvents]), rich);
  $("panel-title").textContent = view.title;
  $("panel-meta").textContent = view.meta;
  const scroll = $("panel-scroll");
  const top = scroll.scrollTop;
  setHTML("panel-body", view.body);
  tickClocks();
  if (!top && preferences.panelScroll) scroll.scrollTop = preferences.panelScroll;
  else scroll.scrollTop = top;
  syncInert();
  if (compact()) { panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true"); }
  else { panel.setAttribute("role", "complementary"); panel.removeAttribute("aria-modal"); }
}
function updateComposer(): void {
  const task = snapshot.task;
  const locked = !connected || taskReadError || !task || sending || busyElsewhere() || task.status === "stopping";
  const stopping = !!task && !!snapshot.active && snapshot.active.workId === workId && snapshot.active.taskId === task.taskId && task.status === "running" && !input.value.trim();
  const button = $<HTMLButtonElement>("send");
  if (!button.dataset.sendIcon) button.dataset.sendIcon = button.innerHTML;
  button.disabled = stopping ? !connected || sending : locked || !input.value.trim();
  button.setAttribute("aria-label", stopping ? "停止" : "发送消息");
  if (button.classList.contains("is-stop") !== stopping) {
    button.classList.toggle("is-stop", stopping);
    button.innerHTML = stopping ? `<span class="stop-mark" aria-hidden="true"></span>` : button.dataset.sendIcon!;
  }
  input.disabled = !task;
  $("stop").hidden = true;
  $("resume-task").hidden = !task || !["stopped", "interrupted", "failed"].includes(task.status) || !!task.pendingChapters.length;
  $<HTMLButtonElement>("resume-task").disabled = locked || !!snapshot.active;
  const elsewhere = busyElsewhere() ? snapshot.tasks.find(item => item.taskId === snapshot.active?.taskId)?.name ?? snapshot.activeName ?? "另一条任务" : "";
  $("composer-meta").textContent = !connected ? "连接断开，输入会保留，恢复后可发送" : elsewhere ? `「${elsewhere}」还在执行，结束后可以在这里发送` : task?.status === "stopping" ? "正在停止，结束后可以继续发送" : task?.status === "running" ? "可以补充要求，Main 会在当前执行中处理" : "";
  const started = !!task?.messages.some(message => message.role === "user");
  input.placeholder = task?.status === "stopping" ? "正在停止…" : !started ? "告诉 Main 这一章想怎么写" : panelAgent && reader.hidden ? `回复 Main（${panelAgent} 不会直接收到）` : task?.status === "running" ? "补充要求，Main 会在当前执行中处理" : "回复 Main";
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
      try { actual = (await api<AppSnapshot>(`/api/state?work=${encodeURIComponent(command.workId)}&task=${encodeURIComponent(command.taskId)}`)).task; } catch { actual = null; }
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
  if ($("send").classList.contains("is-stop")) {
    const target = snapshot.active;
    if (target) await send({ kind: "stop" }, target);
    return;
  }
  const text = input.value.trim();
  if (!text || $<HTMLButtonElement>("send").disabled) return;
  const sentWork = workId; const sentTask = taskId; const sentText = input.value; const sentReference = reference;
  const decision = snapshot.task?.decision;
  const action: CommandAction = decision && !snapshot.active ? { kind: "decide", decisionId: decision.id, answer: text } : { kind: "message", text, ...(reference ? { draftId: reference } : {}) };
  if (await send(action)) {
    if (workId === sentWork && taskId === sentTask) {
      if (input.value === sentText && reference === sentReference) { input.value = ""; reference = undefined; persistInput(); autosize(); updateComposer(); }
      scrollBottom(); input.focus();
    } else {
      const key = preferenceKey(sentWork, sentTask);
      try { const saved = JSON.parse(readStorage(key) ?? "{}"); if (saved.input === sentText && (saved.reference || undefined) === sentReference) writeStorage(key, JSON.stringify({ ...saved, input: "", reference: "" })); } catch { /* Keep unreadable preferences for recovery. */ }
    }
  }
}
function autosize(): void { input.style.height = "auto"; input.style.height = `${Math.min(180, input.scrollHeight)}px`; }
function showDialog(html: string): void { opener = document.activeElement as HTMLElement; setHTML("dialog-body", html); if (!dialog.open) dialog.showModal(); }
function closeDialog(): void { dialog.close(); opener?.focus(); }
async function createTask(): Promise<void> {
  if (!workId || creatingTask) return;
  const work = workId; const current = generation;
  const requestId = readTab(`noya.creation.${work}`) || crypto.randomUUID(); writeTab(`noya.creation.${work}`, requestId);
  creatingTask = true; render();
  try {
    const created = await api<TaskRef>("/api/tasks", { workId: work, requestId }); writeTab(`noya.creation.${work}`, "");
    if (current === generation) { closeDialog(); await selectWork(created.workId, created.taskId); input.focus(); }
    else { toast("新任务已保存，可以从原作品的任务列表进入。"); await refresh(); }
  } catch (error) {
    if (error instanceof ResponseError && error.status < 500) writeTab(`noya.creation.${work}`, "");
    toast(error instanceof Error ? error.message : "创建结果暂未确认，重试会找回同一任务。原输入已保留。");
  } finally { creatingTask = false; render(); }
}
async function create(source?: HTMLButtonElement): Promise<void> {
  const button = source ?? $<HTMLButtonElement>("create-first");
  button.disabled = true;
  try { const result = await api<{ workId: string }>("/api/works", {}); closeDialog(); await selectWork(result.workId); input.focus(); }
  catch (error) { toast(error instanceof Error ? error.message : "新建失败"); }
  finally { button.disabled = false; }
}
async function openDraft(id: string, focus = true): Promise<void> {
  const task = snapshot.task; const current = generation; const request = ++draftSequence;
  if (!task) return;
  try {
    const draft = await api<DraftView & { markdown: string }>(`/api/draft?work=${encodeURIComponent(task.workId)}&task=${encodeURIComponent(task.taskId)}&draft=${encodeURIComponent(id)}`);
    if (current !== generation || request !== draftSequence) return;
    readerOpener = document.activeElement as HTMLElement; reading = draft; textReader = undefined; reader.hidden = false; $("panel").hidden = true; $("return-subtask").hidden = readerFrom !== "panel"; $("revise").hidden = false; $("finalize").hidden = false;
    const top = preferences.reader === id ? preferences.readerScroll ?? 0 : 0;
    preferences.reader = id; preferences.readerScroll = top; $("reader-content").innerHTML = rich(draft.markdown);
    reader.querySelector(".reader-scroll")!.scrollTo({ top, behavior: "instant" }); persistInput();
    renderReader(); responsiveReader(); if (focus) $("close-reader").focus();
  } catch (error) { toast(error instanceof Error ? error.message : "无法读取正文"); }
}
function renderReader(): void {
  if (textReader && !reading) {
    setHTML("reader-meta", `<span>${escape(textReader.title)}</span><span class="badge">只读</span>`);
    $("review-details").hidden = true;
    $("reader-content").innerHTML = rich(textReader.text);
    $("return-subtask").hidden = readerFrom !== "panel";
    $("revise").hidden = true; $("finalize").hidden = true;
    return;
  }
  $("review-details").hidden = false; $("revise").hidden = false; $("finalize").hidden = false;
  if (!reading) return;
  setHTML("reader-meta", `<span>${escape(name())}</span><span>第 ${reading.version} 版 · ${reading.characters.toLocaleString()} 字</span>${reading.finalized ? '<span class="badge">当前正式版本</span>' : reading.superseded ? '<span class="badge warn">已被后续定稿替换 · 本版保留</span>' : ""}`);
  $("review-label").textContent = reading.review === "passed" ? "✓ 四项内容检查通过 · 展开结论" : reading.review === "pending" ? "检查尚未完成" : reading.review === "verification" ? "检查含核实记录 · 结合交稿说明阅读" : "检查发现内容冲突 · 展开结论";
  $("review-content").textContent = reading.reviewText;
  $<HTMLButtonElement>("finalize").disabled = !connected || !!snapshot.active || reading.finalized || sending;
  $("finalize").textContent = reading.finalized ? "本版已定稿" : "将这版定稿";
}
function closeReader(clear = true): void {
  if (!clear) persistInput();
  const back = readerFrom === "panel" ? panelReturn || panelAgent : "";
  draftSequence += 1; reader.hidden = true; reading = undefined; textReader = undefined; syncInert();
  reader.removeAttribute("role"); reader.removeAttribute("aria-modal"); if (clear && taskId) { preferences.reader = ""; preferences.readerScroll = 0; readerFrom = back ? "panel" : "feed"; persistInput(); }
  if (back) { panelAgent = back; readerFrom = "panel"; render(); $("panel-close").focus(); }
  else readerOpener?.focus();
}
function responsiveReader(): void {
  const modal = !reader.hidden && compact();
  syncInert();
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
  showDialog(`<h2 id="dialog-title">停止当前任务？</h2><p>${escape(name(target.workId))} · ${escape(snapshot.activeName ?? target.taskId)}<br>停止这次讨论、写作或检查。已经保存的对话和正文会保留，之后可以继续。</p><div class="dialog-actions"><button class="secondary" data-action="close-dialog">继续等待</button><button id="confirm-stop" class="primary">停止执行</button></div>`);
  $("confirm-stop").onclick = async () => { closeDialog(); await send({ kind: "stop" }, target); };
}

async function openText(id: string): Promise<void> {
  const task = snapshot.task; if (!task) return;
  try {
    const artifact = await api<{ id: string; title: string; text: string }>(`/api/artifact?work=${encodeURIComponent(task.workId)}&task=${encodeURIComponent(task.taskId)}&id=${encodeURIComponent(id)}`);
    textReader = artifact; reading = undefined; reader.hidden = false; $("panel").hidden = true; preferences.artifact = artifact.id;
    $("reader-content").innerHTML = rich(artifact.text);
    renderReader(); responsiveReader(); $("close-reader").focus();
  } catch (error) { toast(error instanceof Error ? error.message : "暂时无法读取"); }
}
function toggleTurn(id: string): void { if (expandedTurns.has(id)) expandedTurns.delete(id); else expandedTurns.add(id); persistInput(); render(); }
function toggleGroup(id: string): void { if (expandedGroups.has(id)) expandedGroups.delete(id); else expandedGroups.add(id); persistInput(); render(); }
function toggleEvent(id: string): void { if (expandedEvents.has(id)) expandedEvents.delete(id); else expandedEvents.add(id); persistInput(); render(); }
function openSubtask(id: string): void {
  listOpen = false; panelAgent = id; panelReturn = id; textReader = undefined;
  if (!reader.hidden) closeReader(false);
  persistInput(); render(); $("panel-close").focus();
}
function closePanel(): void {
  const id = panelAgent; panelAgent = ""; panelReturn = ""; listOpen = false; persistInput(); render();
  document.querySelector<HTMLElement>(`[data-action="open-subtask"][data-agent="${CSS.escape(id)}"]`)?.focus();
}
function syncInert(): void {
  const narrow = compact();
  const modal = narrow && (!reader.hidden || !$("panel").hidden);
  const drawer = narrow && drawerOpen;
  $("task-pane").inert = modal || drawer;
  $("active-notice").inert = modal || drawer;
  $("connection-error").inert = modal || drawer;
  $("sidebar").inert = modal || (narrow && !drawerOpen);
}
function applyChrome(): void {
  const narrow = compact();
  $("app").classList.toggle("sidebar-collapsed", !narrow && collapsed);
  $("app").classList.toggle("drawer-open", narrow && drawerOpen);
  syncInert();
}
function closeOverlays(closeDrawer = false): void {
  worksOpen = false; tasksOpen = false; listOpen = false; hideTip();
  if (closeDrawer && compact()) drawerOpen = false;
  $("work-list").hidden = true; $("task-flyout").hidden = true;
  applyChrome();
}
function newTaskLabel(): string {
  if (creatingTask) return "正在保存新任务…";
  if (workId && readTab(`noya.creation.${workId}`)) return "确认上次创建结果";
  return "新建任务";
}
function paintStable(id: string, html: string): void {
  const node = $(id);
  if (node.dataset.rendered === html) return;
  const top = node.scrollTop;
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const task = active?.dataset.task ?? "";
  const work = active?.dataset.work ?? "";
  const action = active?.dataset.action ?? "";
  const inside = !!active && node.contains(active);
  node.innerHTML = html; node.dataset.rendered = html; node.scrollTop = top;
  if (!inside) return;
  const next = (task ? node.querySelector<HTMLElement>(`[data-task="${CSS.escape(task)}"]`) : null)
    ?? (work ? node.querySelector<HTMLElement>(`[data-work="${CSS.escape(work)}"]`) : null)
    ?? (action ? node.querySelector<HTMLElement>(`[data-action="${CSS.escape(action)}"]`) : null);
  next?.focus({ preventScroll: true });
}
function taskButton(row: SidebarTaskRow, flyout: boolean): string {
  const dot = `<i class="dot${row.live ? " live" : ""}"></i>`;
  if (!flyout) return `<button type="button" class="side-item task-row${row.current ? " current" : ""}" data-task="${escape(row.taskId)}" data-tone="${row.tone}" ${row.current ? 'aria-current="page"' : ""} ${row.clickable ? "" : "disabled"}><span class="slot">${dot}</span><span class="task-text fade"><strong>${escape(row.name)}</strong><small>${escape(row.status)}</small></span></button>`;
  return `<button type="button" class="side-work task-option${row.current ? " selected" : ""}" role="option" data-task="${escape(row.taskId)}" data-tone="${row.tone}" aria-selected="${row.current}" ${row.clickable ? "" : "disabled"}><span class="task-option-dot">${dot}</span><span class="work-text"><strong>${escape(row.name)}</strong><small>${escape(row.status)}</small></span></button>`;
}
function workListHtml(view: SidebarModel, side: boolean): string {
  const title = side && view.work.name !== "选择作品" ? `${view.work.name} · 切换作品` : "切换作品";
  const rows = view.works.map(work => {
    const notes = [work.current ? "当前" : "", work.executing ? "执行中" : "", work.error ?? ""].filter(Boolean).join(" · ");
    const initial = [...(work.name || "作")][0] ?? "作";
    return `<button type="button" class="side-work${work.current ? " selected" : ""}" role="option" data-work="${escape(work.workId)}" aria-selected="${work.current}" ${work.error ? "disabled" : ""}><span class="work-cover">${escape(initial)}</span><span class="work-text"><strong>${escape(work.name)}</strong>${notes ? `<small>${escape(notes)}</small>` : ""}</span></button>`;
  }).join("");
  return `<div class="work-list-label">${escape(title)}</div>${rows}<button type="button" class="secondary work-create" data-action="create">新建作品</button>`;
}
function markTruncatedTips(): void {
  for (const row of $("task-list").querySelectorAll<HTMLButtonElement>(".task-row")) {
    const label = row.querySelector("strong");
    if (label && label.scrollWidth > label.clientWidth + 1) row.dataset.tip = label.textContent ?? "";
    else delete row.dataset.tip;
  }
}
function positionPopovers(): void {
  const rail = railMode();
  const list = $("work-list"); const picker = $("work-picker");
  list.dataset.placement = rail ? "side" : "below";
  if (worksOpen) {
    list.style.top = `${rail ? picker.offsetTop - 6 : picker.offsetTop + picker.offsetHeight + 6}px`;
    list.style.left = rail ? "calc(100% + 8px)" : `${picker.offsetLeft}px`;
  }
  const fly = $("task-flyout"); const sw = $("task-switch");
  if (tasksOpen && rail) { fly.style.top = `${sw.offsetTop - 6}px`; fly.style.left = "calc(100% + 8px)"; }
}
function paintSidebar(): void {
  const view = deriveSidebar({ works: snapshot.works, tasks: snapshot.tasks, workId, taskId, active: snapshot.active, connected, shortcut: shortcutLabel(), currentTaskName: snapshot.task?.name });
  applyChrome();
  $("work-cover").textContent = view.work.initial;
  $("work-name").textContent = view.work.name;
  $("work-meta").textContent = view.work.detail;
  $("crumb-work").textContent = view.work.name;
  const picker = $("work-picker");
  const [workTip, workSub] = view.tips.work.split("\n");
  picker.dataset.tip = workTip ?? "切换作品";
  if (workSub) picker.dataset.tipSub = workSub; else delete picker.dataset.tipSub;
  picker.setAttribute("aria-label", workSub ? `切换作品，当前 ${workSub}` : "切换作品");
  picker.setAttribute("aria-expanded", String(worksOpen));
  const label = newTaskLabel();
  const shownLabel = connected ? label : `${label} · 连接恢复后可用`;
  if ($("new-task-label").textContent !== shownLabel) $("new-task-label").textContent = shownLabel;
  $<HTMLButtonElement>("new-task").disabled = !connected || !workId || creatingTask;
  const [newTip, newSub] = view.tips.newTask.split("\n");
  $("new-task").dataset.tip = newTip ?? "新建任务";
  if (newSub) $("new-task").dataset.tipSub = newSub; else delete $("new-task").dataset.tipSub;
  $("task-count").textContent = String(snapshot.tasks.length);
  const badge = $("task-badge");
  if (view.badge) { badge.hidden = false; badge.dataset.tone = view.badge; } else { badge.hidden = true; badge.dataset.tone = ""; }
  const rail = railMode();
  const sw = $("task-switch");
  sw.tabIndex = rail ? 0 : -1;
  sw.setAttribute("aria-hidden", String(!rail));
  sw.setAttribute("aria-expanded", String(tasksOpen && rail));
  const currentName = snapshot.task?.name || view.tasks.find(row => row.current)?.name || "未选择";
  sw.setAttribute("aria-label", `写作任务，当前 ${currentName}`);
  const [taskTip, taskSub] = view.tips.tasks.split("\n");
  sw.dataset.tip = taskTip ?? "写作任务";
  sw.dataset.tipSub = taskSub ?? "";
  const toggle = $("sidebar-toggle");
  const desktop = !compact();
  const toggleLabel = desktop ? "收起侧边栏" : "关闭侧边栏";
  toggle.tabIndex = rail ? -1 : 0;
  toggle.setAttribute("aria-hidden", String(rail));
  toggle.setAttribute("aria-expanded", String(desktop ? !collapsed : drawerOpen));
  toggle.setAttribute("aria-label", toggleLabel);
  toggle.dataset.tip = view.tips.collapse.split("\n")[0] ?? toggleLabel;
  if (desktop) toggle.dataset.kbd = shortcutLabel(); else delete toggle.dataset.kbd;
  const brand = $("brand-slot");
  brand.tabIndex = rail ? 0 : -1;
  brand.setAttribute("aria-hidden", String(!rail));
  brand.dataset.tip = view.tips.expand.split("\n")[0] ?? "展开侧边栏";
  brand.dataset.kbd = shortcutLabel();
  const connectionText = connected ? "本机已连接" : "连接中断";
  if ($("connection-label").textContent !== connectionText) $("connection-label").textContent = connectionText;
  $("connection").classList.toggle("offline", !connected);
  $("connection").dataset.tip = connectionText;
  paintStable("task-list", view.tasks.map(row => taskButton(row, false)).join(""));
  markTruncatedTips();
  paintStable("work-list", workListHtml(view, rail));
  paintStable("flyout-scroll", view.tasks.map(row => taskButton(row, true)).join(""));
  $("flyout-label").textContent = `${view.work.name} · 写作任务`;
  if ($("flyout-new-label").textContent !== shownLabel) $("flyout-new-label").textContent = shownLabel;
  $<HTMLButtonElement>("flyout-new").disabled = !connected || !workId || creatingTask;
  $("work-list").hidden = !worksOpen;
  $("task-flyout").hidden = !(tasksOpen && rail);
  $("task-list").inert = rail;
  positionPopovers();
  if (tipTarget && !tipTarget.isConnected) hideTip();
}
function toggleSidebar(): void {
  hideTip(); worksOpen = false; tasksOpen = false;
  const inside = $("sidebar").contains(document.activeElement);
  if (compact()) drawerOpen = !drawerOpen;
  else { collapsed = !collapsed; writeRail(collapsed); }
  paintSidebar();
  if (compact()) (drawerOpen ? $("sidebar-toggle") : $("sidebar-open")).focus({ preventScroll: true });
  else if (inside) (collapsed ? $("brand-slot") : $("sidebar-toggle")).focus({ preventScroll: true });
}
function closeDrawer(): void {
  if (!drawerOpen) return;
  drawerOpen = false; worksOpen = false; tasksOpen = false; hideTip();
  paintSidebar(); $("sidebar-open").focus({ preventScroll: true });
}
function toggleWorks(): void {
  hideTip(); worksOpen = !worksOpen; tasksOpen = false; paintSidebar();
  if (worksOpen) ($("work-list").querySelector<HTMLElement>(".selected") ?? $("work-list").querySelector("button"))?.focus({ preventScroll: true });
  else $("work-picker").focus({ preventScroll: true });
}
function toggleTasks(): void {
  if (!railMode()) return;
  hideTip(); tasksOpen = !tasksOpen; worksOpen = false; paintSidebar();
  if (tasksOpen) ($("flyout-scroll").querySelector<HTMLElement>(".selected") ?? $("flyout-scroll").querySelector("button"))?.focus({ preventScroll: true });
  else $("task-switch").focus({ preventScroll: true });
}
const tip = $("side-tip");
let tipTimer = 0;
let tipTarget: HTMLElement | null = null;
let tipWarmUntil = 0;
function showTip(el: HTMLElement): void {
  window.clearTimeout(tipTimer); tipTarget = el; tip.replaceChildren();
  const label = document.createElement("span"); label.textContent = el.dataset.tip ?? ""; tip.append(label);
  if (el.dataset.tipSub) { const sub = document.createElement("small"); sub.textContent = el.dataset.tipSub; tip.append(sub); }
  if (el.dataset.kbd) { const kbd = document.createElement("kbd"); kbd.textContent = el.dataset.kbd; tip.append(kbd); }
  const rect = el.getBoundingClientRect();
  tip.style.left = `${$("sidebar").getBoundingClientRect().right + 8}px`;
  tip.style.top = `${rect.top + rect.height / 2}px`;
  tip.hidden = false;
}
function hideTip(): void {
  window.clearTimeout(tipTimer);
  if (!tip.hidden) tipWarmUntil = Date.now() + 350;
  tip.hidden = true; tipTarget = null;
}
function tipEnabled(el: HTMLElement): boolean {
  if (compact() || !el.dataset.tip) return false;
  if ((el.id === "work-picker" && worksOpen) || (el.id === "task-switch" && tasksOpen)) return false;
  if (railMode()) return true;
  if (el.hasAttribute("data-tip-always")) return true;
  const name = el.querySelector(".task-text strong");
  return el.classList.contains("task-row") && !!name && name.scrollWidth > name.clientWidth + 1;
}
function queueTip(el: HTMLElement | null, immediate = false): void {
  if (el && el === tipTarget) return;
  if (!el || !tipEnabled(el)) { hideTip(); return; }
  window.clearTimeout(tipTimer);
  if (immediate || !tip.hidden || Date.now() < tipWarmUntil) showTip(el);
  else tipTimer = window.setTimeout(() => showTip(el), 420);
}
$("composer").addEventListener("submit", event => { event.preventDefault(); void submit(); });
input.addEventListener("input", () => { persistInput(); autosize(); updateComposer(); });
input.addEventListener("keydown", event => { if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); void submit(); } });
$("new-task").onclick = () => void createTask();
$("create-first").onclick = () => void create();
$("close-reader").onclick = () => closeReader(); $("panel-close").onclick = () => closePanel(); $("return-subtask").onclick = () => closeReader();
$("subtask-entry").onclick = () => { listOpen = !listOpen; render(); if (listOpen) $("subtask-list").querySelector("button")?.focus(); };
$("stop").onclick = confirmStop; $("finalize").onclick = confirmFinalize;
$("revise").onclick = () => { if (!reading) return; reference = reading.draftId; persistInput(); closeReader(); updateComposer(); input.focus(); };
$("resume-task").onclick = () => void send({ kind: "continue" });
$("new-content").onclick = scrollBottom;
feed.addEventListener("scroll", () => { if (feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80) $("new-content").hidden = true; });
dialog.addEventListener("close", () => { opener?.focus(); });
dialog.addEventListener("click", event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeDialog(); } });
document.addEventListener("click", event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button"); if (!button || button.disabled) return;
  if (button.dataset.work) {
    if (dialog.open) closeDialog();
    if (button.dataset.work === workId) { worksOpen = false; paintSidebar(); $("work-picker").focus({ preventScroll: true }); return; }
    void selectWork(button.dataset.work).then(() => { if (!compact()) $("work-picker").focus({ preventScroll: true }); });
  }
  if (button.dataset.task) {
    if (dialog.open) closeDialog();
    const back = compact() && drawerOpen;
    void selectWork(workId, button.dataset.task).then(() => { if (back) $("sidebar-open").focus({ preventScroll: true }); });
  }
  if (button.dataset.claim) {
    const pending = snapshot.task?.pendingSync.find(p => p.chapterId === button.dataset.claim);
    if (pending) void send({ kind: "claim-sync", chapterId: pending.chapterId, version: pending.version });
  }
  if (button.dataset.draft) { readerFrom = "feed"; panelAgent = ""; void openDraft(button.dataset.draft); }
  if (button.dataset.action === "open-result" && button.dataset.result) {
    const fromPanel = !!button.closest("#panel, #panel-body");
    readerFrom = fromPanel ? "panel" : "feed";
    if (fromPanel) panelReturn = panelAgent; else { panelAgent = ""; panelReturn = ""; }
    const id = button.dataset.result;
    if (id.startsWith("draft_")) void openDraft(id); else void openText(id);
  }
  if (button.dataset.action === "retry-result") void refresh();
  if (button.dataset.action === "toggle-turn" && button.dataset.turn) toggleTurn(button.dataset.turn);
  if (button.dataset.action === "toggle-group" && button.dataset.group) toggleGroup(button.dataset.group);
  if (button.dataset.action === "toggle-event" && button.dataset.event) toggleEvent(button.dataset.event);
  if (button.dataset.action === "open-subtask" && button.dataset.agent) openSubtask(button.dataset.agent);
  if (button.dataset.action === "close-subtasks") { listOpen = false; render(); $("subtask-entry").focus(); }
  if (button.dataset.decision !== undefined && snapshot.task?.decision) { const d = snapshot.task.decision; void send({ kind: "decide", decisionId: d.id, answer: d.options[Number(button.dataset.decision)] }); }
  const action = button.dataset.action;
  if (action === "close-dialog") closeDialog();
  if (action === "create") void create(button);
  if (action === "create-task") void createTask();
  if (action === "toggle-sidebar") toggleSidebar();
  if (action === "toggle-tasks") toggleTasks();
  if (button.id === "work-picker") toggleWorks();
  if (action === "close-drawer") closeDrawer();
  if (action === "migrate") { migratePreferences(true); updateComposer(); }
  if (action === "clear-reference") { reference = undefined; persistInput(); updateComposer(); input.focus(); }
  if (action === "continue") void send({ kind: "continue" });
  if (action === "return-active" && snapshot.active) void selectWork(snapshot.active.workId, snapshot.active.taskId);
  if (action === "stop-active") confirmStop();
});
document.addEventListener("keydown", event => {
  const shortcut = event.key === "\\" && !event.altKey && !event.shiftKey && (mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey);
  if (shortcut) { event.preventDefault(); if (!(compact() && (!reader.hidden || !$("panel").hidden))) toggleSidebar(); return; }
  if (event.key === "Escape" && !dialog.open && tasksOpen) { event.preventDefault(); tasksOpen = false; paintSidebar(); $("task-switch").focus({ preventScroll: true }); return; }
  if (event.key === "Escape" && !dialog.open && worksOpen) { event.preventDefault(); worksOpen = false; paintSidebar(); $("work-picker").focus({ preventScroll: true }); return; }
  if (event.key === "Escape" && !dialog.open && listOpen) { event.preventDefault(); listOpen = false; render(); $("subtask-entry").focus(); }
  else if (event.key === "Escape" && !dialog.open && !reader.hidden) { event.preventDefault(); closeReader(); }
  else if (event.key === "Escape" && !dialog.open && panelAgent && reader.hidden) { event.preventDefault(); closePanel(); }
  else if (event.key === "Escape" && !dialog.open && compact() && drawerOpen && reader.hidden && $("panel").hidden) { event.preventDefault(); closeDrawer(); }
  if (event.key === "Tab" && !$("panel").hidden && reader.hidden && matchMedia("(max-width: 780px)").matches && !dialog.open) {
    const items = [...$("panel").querySelectorAll<HTMLElement>("button:not(:disabled), summary, [tabindex='0']")];
    if (items.length && event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
    if (items.length && !event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
  }
  if (event.key === "Tab" && !reader.hidden && matchMedia("(max-width: 780px)").matches && !dialog.open) {
    const items = [...reader.querySelectorAll<HTMLElement>('button:not(:disabled),summary,[tabindex="0"]')];
    if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
    if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
  }
});
function onViewport(): void {
  const next = compact();
  if (next !== viewportNarrow) { viewportNarrow = next; drawerOpen = false; worksOpen = false; tasksOpen = false; hideTip(); $("work-list").hidden = true; $("task-flyout").hidden = true; }
  applyChrome(); positionPopovers(); markTruncatedTips(); responsiveReader();
}
window.addEventListener("resize", onViewport);
window.addEventListener("online", () => void refresh());
window.addEventListener("pagehide", persistInput);
document.addEventListener("click", event => {
  const target = event.target as HTMLElement;
  if (!listOpen || $("subtask-anchor").contains(target)) return;
  listOpen = false; render();
});
function tickClocks(): void {
  if (!connected) return;
  document.querySelectorAll<HTMLTimeElement>("time[data-start]").forEach(node => {
    const start = Number(node.dataset.start);
    if (!Number.isFinite(start)) return;
    const next = elapsedClock(Math.max(0, Date.now() - start));
    if (node.textContent !== next) node.textContent = next;
  });
}
setInterval(tickClocks, 1000);
applyChrome();
requestAnimationFrame(() => requestAnimationFrame(() => $("app").classList.add("sidebar-ready")));
$("sidebar").addEventListener("pointerover", event => { if (event.pointerType === "touch") return; queueTip((event.target as HTMLElement).closest<HTMLElement>("[data-tip]")); });
$("sidebar").addEventListener("pointerleave", hideTip);
$("sidebar").addEventListener("pointerdown", hideTip);
$("sidebar").addEventListener("focusin", event => { const el = (event.target as HTMLElement).closest<HTMLElement>("[data-tip]"); if (el?.matches(":focus-visible")) queueTip(el, true); else hideTip(); });
$("sidebar").addEventListener("focusout", event => { if (!$("sidebar").contains(event.relatedTarget as Node)) hideTip(); });
$("task-list").addEventListener("scroll", hideTip, { passive: true });
document.addEventListener("pointerdown", event => {
  const target = event.target as Node;
  if (worksOpen && !$("work-picker").contains(target) && !$("work-list").contains(target)) { worksOpen = false; $("work-list").hidden = true; $("work-picker").setAttribute("aria-expanded", "false"); $("work-picker").focus({ preventScroll: true }); }
  if (tasksOpen && !$("task-switch").contains(target) && !$("task-flyout").contains(target)) { tasksOpen = false; $("task-flyout").hidden = true; $("task-switch").setAttribute("aria-expanded", "false"); $("task-switch").focus({ preventScroll: true }); }
});
void (async () => { await refresh(); setTimeout(() => void poll(), 650); })();
