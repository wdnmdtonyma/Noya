import type { AppSnapshot, DraftView, PageCommand, TaskRef, TaskView } from "../src/local-contract.js";
import { elapsedClock, subtaskEntryLabel } from "./feed.js";
import { renderFeed, renderPanel, renderSubtaskList } from "./markup.js";

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
let pickerOpen = false;
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
  $("connection").querySelector("span")!.textContent = ok ? "本机已连接" : "连接中断";
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
      if (!workId && next.works.length > 1) chooseWork();
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
      await refresh(); chooseWork(); return;
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
  persistInput(); readerFrom = "feed"; panelReturn = ""; closeReader(false); generation += 1; workId = id;
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
  $("work-name").textContent = name();
  $("task-switcher").hidden = !workId;
  $<HTMLButtonElement>("new-task").disabled = creatingTask || !connected;
  $("new-task").hidden = !workId;
  $("task-count").textContent = `${snapshot.tasks.length} 个任务`;
  if (pickerOpen) renderTaskPicker();
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
  if (changed) { $("messages").innerHTML = feedHtml; $("messages").dataset.rendered = feedHtml; }
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
  $("subtask-entry").innerHTML = `<span>${escape(label)}</span>`;
  $("subtask-entry").setAttribute("aria-expanded", String(listOpen));
  $("subtask-list").hidden = !listOpen;
  if (listOpen) setHTML("subtask-list", renderSubtaskList(task.runs));
  const cards = [...document.querySelectorAll<HTMLElement>(`.task-card[data-running="1"]`)];
  const box = feed.getBoundingClientRect();
  const visible = cards.some(card => { const rect = card.getBoundingClientRect(); return rect.bottom > box.top + 8 && rect.top < box.bottom - 8; });
  if (visible !== runningVisible) { runningVisible = visible; $("subtask-entry").innerHTML = `<span>${escape(subtaskEntryLabel(task.runs, { runningCardsVisible: runningVisible, connected }))}</span>`; }
}
function paintPanel(task: TaskView): void {
  const panel = $("panel");
  if (!panelAgent || !reader.hidden) {
    panel.hidden = true;
    if (reader.hidden) { $("task-pane").inert = false; $("app").querySelector<HTMLElement>(".app-header")!.inert = false; $("active-notice").inert = false; $("connection-error").inert = false; }
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
  if (!top && preferences.panelScroll) scroll.scrollTop = preferences.panelScroll;
  else scroll.scrollTop = top;
  const narrow = matchMedia("(max-width: 780px)").matches;
  $("task-pane").inert = narrow;
  $("app").querySelector<HTMLElement>(".app-header")!.inert = narrow;
  $("active-notice").inert = narrow;
  $("connection-error").inert = narrow;
  if (narrow) { panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true"); }
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
  button.classList.toggle("is-stop", stopping);
  button.innerHTML = stopping ? `<span class="stop-mark" aria-hidden="true"></span>` : button.dataset.sendIcon;
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
function closeDialog(): void { pickerOpen = false; dialog.classList.remove("task-picker"); dialog.close(); opener?.focus(); }
function chooseWork(): void {
  pickerOpen = false; dialog.classList.remove("task-picker");
  showDialog(`<span class="eyebrow">你的故事</span><h2 id="dialog-title">选择一部作品</h2><div class="work-list">${snapshot.works.map(w => `<button class="work-option ${w.workId === workId ? "selected" : ""}" data-work="${escape(w.workId)}"><span>${escape(w.name)}${w.error ? `<small><br>${escape(w.error)}</small>` : ""}</span><small>${w.workId === snapshot.active?.workId ? "执行中" : w.workId === workId ? "当前" : "↗"}</small></button>`).join("")}</div><button class="secondary" data-action="create">＋ 新建作品</button><div class="dialog-actions"><button class="quiet-button" data-action="close-dialog">关闭</button></div>`);
}
function taskTime(value: string): string {
  return value ? new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "记录不可用";
}
function renderTaskPicker(): void {
  const activeElement = document.activeElement as HTMLElement;
  const focused = activeElement?.dataset.task;
  const focusedAction = activeElement?.dataset.action;
  const scroll = dialog.querySelector(".task-list")?.scrollTop ?? 0;
  setHTML("dialog-body", `<div class="picker-heading"><div><span class="eyebrow">${escape(name())}</span><h2 id="dialog-title">写作任务 <small>${snapshot.tasks.length}</small></h2></div><button class="icon-button" data-action="close-dialog" aria-label="关闭任务列表">×</button></div><p class="picker-description">每个想法，各有一页。随时回来，接着写。</p><button class="new-task-option" data-action="create-task" ${creatingTask || !connected ? "disabled" : ""}><span class="new-task-icon">＋</span><span><strong>${creatingTask ? "正在保存新任务…" : readTab(`noya.creation.${workId}`) ? "确认上次创建结果" : "新建任务"}</strong><small>共享作品资料，开始独立的讨论</small></span><span>↗</span></button><div class="task-list" aria-label="本作品的写作任务">${snapshot.tasks.map(t => `<button class="task-option ${t.taskId === taskId ? "selected" : ""}" data-task="${escape(t.taskId)}" ${t.error ? "disabled" : ""} ${t.taskId === taskId ? 'aria-current="true"' : ""}><span class="task-option-mark">${t.taskId === taskId ? "●" : "○"}</span><span class="task-option-body"><strong>${escape(t.name)}</strong><small>${escape(taskTime(t.createdAt))} · ${escape(t.taskId.slice(-6))}</small>${t.error ? `<small class="task-option-error">${escape(t.error)}</small>` : ""}</span><span class="task-option-state ${t.status === "running" ? "is-running" : t.needsDecision ? "is-waiting" : ""}">${t.error ? "记录损坏" : t.status === "running" ? "执行中" : t.status === "stopping" ? "停止中" : t.needsDecision ? "待决定" : t.taskId === taskId ? "正在查看" : t.status === "idle" ? "" : escape(labels[t.status] ?? t.status)}</span></button>`).join("")}</div><div class="picker-footer">讨论和初稿分别保留 · 新建不会打断正在执行的任务</div>`);
  const list = dialog.querySelector(".task-list"); if (list) list.scrollTop = scroll;
  if (focused) dialog.querySelector<HTMLButtonElement>(`[data-task="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
  else if (focusedAction) dialog.querySelector<HTMLButtonElement>(`[data-action="${CSS.escape(focusedAction)}"]`)?.focus({ preventScroll: true });
}
function chooseTask(): void {
  pickerOpen = true; dialog.classList.add("task-picker"); opener = document.activeElement as HTMLElement;
  renderTaskPicker(); if (!dialog.open) dialog.showModal();
}
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
async function create(): Promise<void> {
  const button = dialog.querySelector<HTMLButtonElement>('[data-action="create"]') ?? $<HTMLButtonElement>("create-first");
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
  draftSequence += 1; reader.hidden = true; reading = undefined; textReader = undefined; $("task-pane").inert = false; $("app").querySelector<HTMLElement>(".app-header")!.inert = false;
  $("active-notice").inert = false; $("connection-error").inert = false;
  reader.removeAttribute("role"); reader.removeAttribute("aria-modal"); if (clear && taskId) { preferences.reader = ""; preferences.readerScroll = 0; readerFrom = back ? "panel" : "feed"; persistInput(); }
  if (back) { panelAgent = back; readerFrom = "panel"; render(); $("panel-close").focus(); }
  else readerOpener?.focus();
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
$("composer").addEventListener("submit", event => { event.preventDefault(); void submit(); });
input.addEventListener("input", () => { persistInput(); autosize(); updateComposer(); });
input.addEventListener("keydown", event => { if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); void submit(); } });
$("task-switcher").onclick = chooseTask; $("new-task").onclick = () => void createTask();
$("work-switcher").onclick = chooseWork; $("create-first").onclick = () => void create();
$("close-reader").onclick = () => closeReader(); $("panel-close").onclick = () => closePanel(); $("return-subtask").onclick = () => closeReader();
$("subtask-entry").onclick = () => { listOpen = !listOpen; render(); if (listOpen) $("subtask-list").querySelector("button")?.focus(); };
$("stop").onclick = confirmStop; $("finalize").onclick = confirmFinalize;
$("revise").onclick = () => { if (!reading) return; reference = reading.draftId; persistInput(); closeReader(); updateComposer(); input.focus(); };
$("resume-task").onclick = () => void send({ kind: "continue" });
$("new-content").onclick = scrollBottom;
feed.addEventListener("scroll", () => { if (feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80) $("new-content").hidden = true; });
dialog.addEventListener("close", () => { pickerOpen = false; dialog.classList.remove("task-picker"); opener?.focus(); });
dialog.addEventListener("click", event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeDialog(); } });
document.addEventListener("click", event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button"); if (!button || button.disabled) return;
  if (button.dataset.work) { closeDialog(); void selectWork(button.dataset.work); }
  if (button.dataset.task) { closeDialog(); void selectWork(workId, button.dataset.task); }
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
  if (action === "create") void create();
  if (action === "create-task") void createTask();
  if (action === "migrate") { migratePreferences(true); updateComposer(); }
  if (action === "clear-reference") { reference = undefined; persistInput(); updateComposer(); input.focus(); }
  if (action === "continue") void send({ kind: "continue" });
  if (action === "return-active" && snapshot.active) void selectWork(snapshot.active.workId, snapshot.active.taskId);
  if (action === "stop-active") confirmStop();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !dialog.open && listOpen) { event.preventDefault(); listOpen = false; render(); $("subtask-entry").focus(); }
  else if (event.key === "Escape" && !dialog.open && !reader.hidden) { event.preventDefault(); closeReader(); }
  else if (event.key === "Escape" && !dialog.open && panelAgent && reader.hidden) { event.preventDefault(); closePanel(); }
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
window.addEventListener("resize", responsiveReader);
window.addEventListener("online", () => void refresh());
window.addEventListener("pagehide", persistInput);
document.addEventListener("click", event => {
  const target = event.target as HTMLElement;
  if (!listOpen || $("subtask-anchor").contains(target)) return;
  listOpen = false; render();
});
setInterval(() => {
  if (!connected) return;
  document.querySelectorAll<HTMLTimeElement>("time[data-start]").forEach(node => {
    const start = Number(node.dataset.start);
    if (Number.isFinite(start)) node.textContent = elapsedClock(Math.max(0, Date.now() - start));
  });
}, 1000);
void (async () => { await refresh(); setTimeout(() => void poll(), 650); })();
