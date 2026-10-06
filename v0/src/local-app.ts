import { chapterOwnership, claimSync, repairFinalizations, readWorkState, type WorkReadState } from "./sync-ownership.ts";
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { openWritingSession } from "./app.ts";
import { findById, loadCanon } from "./canon.ts";
import { createWork, createTaskRecord, discoverTasks, loadRegistry, taskLayout, loadDraft, markInterruptedAgents, saveRegistry, workLayout, listArtifactIds, readJsonFile, type CheckArtifact, type ProposalArtifact, type WorkLayout, type TaskLayout, type TaskRegistry } from "./layout.ts";
import type { NoyaConfig } from "./config.ts";
import type { AppSnapshot, PageCommand, TaskRef, TaskSummary } from "./local-contract.ts";
import { contentHash, isId, refuse } from "./util.ts";
import { resolveRoleModels } from "./models.ts";
import { assistantFailure, messageText } from "./transcript.ts";
import { pageRecord, readDrafts, readMessages, savePageRecord, type PageRecord } from "./local-records.ts";
import { partialText, readContextProcess, type LiveCall } from "./process.ts";
import { buildRuns } from "./runs.ts";
import { recordAuthorMessage } from "./session.ts";

type Runtime = Awaited<ReturnType<typeof resolveRoleModels>>;
type Opened = Awaited<ReturnType<typeof openWritingSession>>;
type Entry = { task: TaskLayout; registry: TaskRegistry; page: PageRecord; opened?: Opened; opening?: Promise<Opened>; stopping?: Promise<void>; submitting: number; claiming?: boolean; streaming?: string; activity?: string; liveText: Map<string, string>; liveCalls: Map<string, LiveCall>; watched: WeakSet<object> };

export class AppError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

/** Owns one author's execution across every browser tab. Viewing never opens an Agent. */
export class LocalApp {
  private configValue?: NoyaConfig;
  private configurationError?: string;
  get config(): NoyaConfig { if (!this.configValue) throw new AppError(503, this.configurationError ?? "模型配置尚未完成"); return this.configValue; }
  active: TaskRef | null = null;
  private runtime?: Runtime;
  private entries = new Map<string, Entry>();
  private monitor: ReturnType<typeof setInterval>;
  private closed = false;
  private commands = new Map<string, { signature: string; result: Promise<{ accepted: true }> }>();
  constructor(options: { config?: NoyaConfig; modelRuntime?: Runtime; configurationError?: string }) {
    this.configValue = options.config;
    this.configurationError = options.configurationError;
    this.runtime = options.modelRuntime;
    this.monitor = setInterval(() => this.settle(), 80);
    this.monitor.unref();
  }
  private work(id: string): WorkLayout {
    if (!isId(id)) throw new AppError(404, "作品标识无效");
    const work = workLayout(this.config.worksRoot, id, join(this.config.worksRoot, ".noya", "agent"));
    if (!existsSync(work.workDir) || lstatSync(work.workDir).isSymbolicLink() || !existsSync(join(work.workDir, "canon", "sync.json"))) throw new AppError(404, `找不到作品 ${id}`);
    return work;
  }
  private entry(workId: string, taskId: string): Entry {
    const work = this.work(workId);
    if (!isId(taskId)) throw new AppError(404, "任务标识无效");
    const key = `${workId}/${taskId}`;
    const cached = this.entries.get(key);
    if (cached) return cached;
    const task = taskLayout(work, taskId);
    let registry: TaskRegistry;
    try { registry = loadRegistry(task); }
    catch { throw new AppError(409, `任务 ${taskId} 的登记记录缺失或归属损坏，请选择其他任务`); }
    const page = pageRecord(task);
    // This is the first observation in this process, never a reconnect of a live runtime.
    if (page.status === "running" || page.status === "stopping") {
      page.status = page.stoppedByAuthor ? "stopped" : "interrupted";
      page.error = page.stoppedByAuthor ? undefined : "本机程序已退出，上次执行中断。已保存的对话和正文仍在。";
      if (page.stoppedByAuthor) rememberEnd(page, "stopped", "已停止");
      else rememberEnd(page, "interrupted", "执行中断");
    }
    markInterruptedAgents(registry);
    saveRegistry(task, registry); savePageRecord(task, page);
    const entry = { task, registry, page, submitting: 0, liveText: new Map<string, string>(), liveCalls: new Map<string, LiveCall>(), watched: new WeakSet<object>() };
    this.entries.set(key, entry);
    return entry;
  }
  async createTask(workId: string, requestId: string): Promise<TaskRef> {
    if (this.closed) throw new AppError(503, "本机服务正在退出");
    if (typeof requestId !== "string" || !/^[\w-]{8,80}$/.test(requestId)) throw new AppError(400, "新建任务缺少有效请求身份");
    const work = this.work(workId);
    const existing = discoverTasks(work).find(t => t.registry?.creation_request_id === requestId);
    if (existing) return { workId, taskId: existing.task.taskId };
    // Synchronous registration is the commit point; no concurrent request can pass it.
    const fresh = createTaskRecord(work);
    fresh.registry.creation_request_id = requestId;
    savePageRecord(fresh.task, pageRecord(fresh.task));
    saveRegistry(fresh.task, fresh.registry);
    return { workId, taskId: fresh.task.taskId };
  }
  private summaries(workId: string, workState: WorkReadState = readWorkState(this.work(workId))): TaskSummary[] {
    return discoverTasks(this.work(workId)).map(item => {
      const base: TaskSummary = { workId, taskId: item.task.taskId, name: `新任务 · ${item.task.taskId.slice(-6)}`, createdAt: item.registry?.created_at ?? "", status: "failed", needsDecision: false };
      try {
        if (item.error) throw new Error(item.error);
        const entry = this.entry(workId, item.task.taskId);
        const registry = entry.opened?.hub.registry ?? entry.registry;
        const first = readMessages(entry.task, registry, entry.page).find(m => m.role === "user");
        readDrafts(entry.task, registry, workState);
        return { ...base, name: first ? [...first.text.replace(/\s+/g, " ").trim()].slice(0, 28).join("") : base.name, status: entry.page.status, needsDecision: !!entry.page.decision };
      } catch (error) { return { ...base, error: errorText(error) }; }
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.taskId.localeCompare(a.taskId));
  }
  async create(): Promise<{ workId: string }> {
    const work = await createWork(this.config.worksRoot, join(this.config.worksRoot, ".noya", "agent"));
    const opened = createTaskRecord(work);
    saveRegistry(opened.task, opened.registry);
    return { workId: work.workId };
  }
  async snapshot(workId?: string, taskId?: string): Promise<AppSnapshot> {
    if (!this.configValue) return { works: [], tasks: [], task: null, active: null, configurationError: this.configurationError ?? "请检查 NOYA_CONFIG 指向的配置文件" };
    const works: AppSnapshot["works"] = [];
    if (existsSync(this.config.worksRoot)) for (const dir of readdirSync(this.config.worksRoot, { withFileTypes: true })) {
      if (!dir.isDirectory() || !isId(dir.name) || !existsSync(join(this.config.worksRoot, dir.name, "canon", "sync.json"))) continue;
      const item = { workId: dir.name, name: `未命名作品 · ${dir.name}` };
      try { loadCanon(this.work(dir.name).workDir); works.push(item); }
      catch { works.push({ ...item, error: `作品 ${dir.name} 的资料记录损坏` }); }
    }
    works.sort((a, b) => a.workId.localeCompare(b.workId));
    const activeEntry = this.active ? this.entries.get(`${this.active.workId}/${this.active.taskId}`) : undefined;
    const activeName = activeEntry?.page.messages.find(m => m.role === "user")?.text.replace(/\s+/g, " ").slice(0, 28) ?? this.active?.taskId;
    if (!workId) return { works, tasks: [], task: null, active: this.active, activeName };
    let workState = readWorkState(this.work(workId));
    if ([...workState.ownership.values()].some(o => o.needsRepair)) {
      try { await repairFinalizations(this.work(workId)); this.refreshFinalizations(workId); workState = readWorkState(this.work(workId)); }
      catch { /* The derived pending entry below remains a visible writing gate. */ }
    }
    const pendingChapters = [...new Set([...workState.canon.sync.pending_chapter_ids, ...[...workState.ownership].filter(([, owner]) => owner.needsRepair).map(([id]) => id)])];
    let tasks = this.summaries(workId, workState);
    if (!tasks.length && !taskId) { await this.createTask(workId, "initial-task"); tasks = this.summaries(workId, workState); }
    const selected = taskId ? tasks.find(t => t.taskId === taskId) : tasks.find(t => !t.error);
    if (!selected || selected.error) {
      return { works, tasks, active: this.active, activeName, task: null, selectionError: selected?.error ?? (taskId ? `任务 ${taskId} 不存在，请重新选择` : "没有可读取的任务，请保留损坏记录后修复，或明确新建任务") };
    }
    const entry = this.entry(workId, selected.taskId);
    const { task, page } = entry;
    const registry = entry.opened?.hub.registry ?? entry.registry;
    const drafts = readDrafts(task, registry, workState);
    const processView = readContextProcess(task, registry, page, [...entry.liveCalls.values()], entry.liveText.get("context"));
    const runs = buildRuns(task, registry, page.status, processView.items, drafts, [...entry.liveCalls.values()], entry.liveText);
    return { works, tasks, active: this.active, activeName, task: {
      name: selected.name, createdAt: selected.createdAt,
      workId, taskId: task.taskId, status: page.status, error: page.error,
      messages: readMessages(task, registry, page), drafts, process: processView.items, runs, ...(processView.gap ? { gap: processView.gap } : {}),
      agents: registry.subagents.map(a => ({ id: a.id, role: a.role, status: a.status, detail: a.failureReason || (a.artifacts.length ? `已保存 ${a.artifacts.length} 份工作记录` : "尚未提交产物") })),
      pendingChapters,
      pendingSync: pendingChapters.map(chapterId => {
        const ownership = workState.ownership.get(chapterId) ?? { version: "", error: "章节正文缺失" };
        return { chapterId, title: workState.canon.chapters.get(chapterId)?.title ?? chapterId, version: ownership.version,
          ...(ownership.owner ? { owner: { workId, taskId: ownership.owner.taskId }, ownerName: tasks.find(t => t.taskId === ownership.owner!.taskId)?.name } : {}), ...(ownership.error ? { error: ownership.error } : ownership.needsRepair ? { error: "正文已保存，待同步状态尚未完整保存；请检查存储后重试" } : {}) };
      }),
      ...(page.decision ? { decision: { id: page.decision.id, title: page.decision.title, detail: page.decision.detail, options: page.decision.options } } : {}),
      ...(entry.streaming ? { streaming: entry.streaming } : {}),
      ...(entry.activity ? { activity: entry.activity } : {}),
    } };
  }
  async draft(ref: TaskRef, draftId: string) { return this.draftView(ref, draftId); }
  async artifact(ref: TaskRef, id: string): Promise<{ id: string; title: string; text: string }> {
    if (!/^(plan|review|check|proposal)_\d+$/.test(id)) throw new AppError(404, "这份成果不存在");
    const entry = this.target(ref);
    const file = join(entry.task.artifactsDir, `${id}.${id.startsWith("plan_") ? "md" : "json"}`);
    if (!existsSync(file)) throw new AppError(404, "暂时无法读取");
    try {
      const text = readFileSync(file, "utf8");
      if (!text.trim()) throw new Error("empty");
      const title = id.startsWith("plan_") ? text.split("\n").find(line => line.startsWith("# "))?.slice(2).trim() || "章节方案" : id.startsWith("review_") ? "检查报告" : id.startsWith("check_") ? "核对结论" : "资料变更";
      return { id, title, text };
    } catch (error) { if (error instanceof AppError) throw error; throw new AppError(404, "暂时无法读取"); }
  }
  private draftView(ref: TaskRef, draftId: string) {
    const entry = this.target(ref);
    const view = readDrafts(entry.task, entry.opened?.hub.registry ?? entry.registry).find(d => d.draftId === draftId);
    const draft = loadDraft(entry.task, draftId);
    if (!view || !draft) throw new AppError(404, "这份稿件不存在或未完整保存");
    return { ...view, markdown: draft.markdown };
  }
  private refreshFinalizations(workId: string): void {
    for (const entry of this.entries.values()) {
      if (entry.task.work.workId !== workId) continue;
      let saved: TaskRegistry;
      try { saved = loadRegistry(entry.task); } catch { continue; }
      for (const registry of [entry.registry, entry.opened?.hub.registry].filter(r => !!r)) {
        for (const record of registry.finalizations) {
          if (saved.finalizations.some(f => f.event_id === record.event_id && f.state === "saved")) record.state = "saved";
        }
      }
    }
  }
  private target(ref: TaskRef): Entry {
    return this.entry(ref.workId, ref.taskId);
  }
  private async open(entry: Entry): Promise<Opened> {
    if (entry.opened) return entry.opened;
    if (entry.opening) return entry.opening;
    entry.opening = (async () => {
      this.runtime ??= await resolveRoleModels(this.config, join(this.config.worksRoot, ".noya", "agent"));
      const restoreAccepted = !existsSync(entry.registry.context_session_file) && !entry.page.sessionSaved;
      const opened = await openWritingSession({ work: entry.task.work, config: this.config, ...this.runtime, taskId: entry.task.taskId });
      entry.opened = opened;
      if (restoreAccepted) for (const accepted of entry.page.messages.filter(m => m.role === "user")) {
        recordAuthorMessage(opened.runtimeHost.session, `[页面作者]\n${accepted.text}${accepted.draftId ? `\n作者引用的稿件：${accepted.draftId}` : ""}`, accepted.at);
      }
      opened.hub.confirmPageWrite = (kind, args) => this.confirmWrite(entry, kind, args);
      opened.hub.requestPageDecision = args => {
        entry.page.decision = { id: randomUUID(), kind: "direction", args, fingerprint: this.confirmationFingerprint(entry, args), title: String(args.question), detail: String(args.detail), options: args.options as string[] };
        savePageRecord(entry.task, entry.page);
        return "具体问题已显示在作者页面，请结束本轮等待作者回答。";
      };
      const follow = (agentId: string, session: Opened["runtimeHost"]["session"]) => {
        if (entry.watched.has(session)) return;
        entry.watched.add(session);
        session.subscribe(event => {
          observeSession(entry, agentId, event);
          if (agentId === "context" && event.type === "message_end" && !entry.page.sessionSaved && existsSync(opened.hub.registry.context_session_file)) {
            entry.page.sessionSaved = true;
            try { savePageRecord(entry.task, entry.page); } catch (error) { entry.page.error = `保存任务记录失败：${errorText(error)}`; }
          }
        });
      };
      follow("context", opened.runtimeHost.session);
      opened.hub.watchAgent(follow);
      await opened.runtimeHost.session.sendCustomMessage({ customType: "noya.page", display: false, content: "作者正在本机任务页面。正文从交稿卡片阅读，定稿由页面明确选择版本；不要让作者输入 /finalize 或寻找文件。普通讨论不开始写作。文件读取与搜索仅允许 canon/、当前 tasks/任务身份/ 和流程技能目录，不要从作品根递归搜索。其他任务负责的待同步章节只能提示作者返回该任务，不要尝试接管。页面引用的稿件是修改的唯一基准，即使已有新稿；先读取指定稿件。原 Writer 已终止时必须告知作者并根据保存材料重新安排。写入资料时页面会把确切变更呈现给作者；工具说等待页面确认时结束本轮，不重复尝试。作者明确停止不自动恢复。" }, { triggerTurn: false });
      return opened;
    })();
    try { return await entry.opening; } finally { entry.opening = undefined; }
  }
  private confirmWrite(entry: Entry, kind: "canon" | "sync", args: Record<string, unknown>) {
    const content = { ...args }; delete content.author_confirmation;
    const fingerprint = this.confirmationFingerprint(entry, content);
    if (entry.page.approved?.kind === kind && entry.page.approved.fingerprint === fingerprint) {
      delete entry.page.approved; savePageRecord(entry.task, entry.page); return;
    }
    const detail = kind === "canon" ? describeChanges(content.changes) : this.syncDetail(entry, content);
    if (!entry.page.decision || entry.page.decision.fingerprint !== fingerprint) {
      entry.page.decision = { id: randomUUID(), kind, args: content, fingerprint, title: kind === "canon" ? "将这些内容写入作品资料？" : "正文与已有设定存在分歧", detail, options: kind === "canon" ? ["确认写入", "暂不写入"] : ["以定稿正文为准", "保留原设定"] };
      savePageRecord(entry.task, entry.page);
    }
    refuse("已向页面作者展示具体变更。等待页面确认，结束本轮；不要重复调用或自行确认。");
  }
  private syncDetail(entry: Entry, args: Record<string, unknown>): string {
    const id = String(args.proposal_id);
    if (!/^proposal_\d+$/.test(id)) throw new AppError(400, "同步清单无效");
    const proposal = readJsonFile<ProposalArtifact>(join(entry.task.artifactsDir, `${id}.json`));
    const check = listArtifactIds(entry.task, "check").map(checkId => readJsonFile<CheckArtifact>(join(entry.task.artifactsDir, `${checkId}.json`))).filter(c => c.proposal_id === id).at(-1);
    const canon = loadCanon(entry.task.work.workDir);
    const conflicts = (check?.verdicts ?? []).filter(v => v.verdict === "conflict").map(v => {
      const existing = (v.conflicting_ids as string[]).map(objectId => findById(canon, objectId)).filter(item => !!item);
      return `${String(v.reason)}\n${existing.map(item => describeValue(item.doc)).join("\n")}`;
    });
    return `${describeChanges(proposal.changes)}${conflicts.length ? `\n\n与以下既有资料有分歧：\n${conflicts.join("\n\n")}` : ""}`;
  }
  private confirmationFingerprint(entry: Entry, args: Record<string, unknown>): string {
    const canon = loadCanon(entry.task.work.workDir);
    return contentHash(JSON.stringify({ args, canon, versions: [...canon.chapters.keys()].map(id => chapterOwnership(entry.task.work, id)) }, (_key, value) => value instanceof Map ? Object.fromEntries(value) : value));
  }
  /** Called once at service startup, never from a view or work switch. */
  async recover(): Promise<void> {
    if (!this.configValue) return;
    const { works } = await this.snapshot();
    for (const work of works) {
      if (work.error) continue;
      try { await repairFinalizations(this.work(work.workId)); } catch { /* Keep uncertain records visible and never guess an owner. */ }
      for (const summary of this.summaries(work.workId)) {
        if (this.active) return;
        if (summary.error) continue;
        try {
          const entry = this.entry(work.workId, summary.taskId);
          const pending = loadCanon(entry.task.work.workDir).sync.pending_chapter_ids.filter(id => {
            const state = chapterOwnership(entry.task.work, id);
            return !state.error && state.owner?.taskId === entry.task.taskId;
          });
          if (entry.page.status !== "interrupted" || entry.page.stoppedByAuthor || entry.page.decision || !pending.length) continue;
          this.active = { workId: work.workId, taskId: entry.task.taskId };
          entry.submitting += 1;
          entry.page.status = "running"; entry.page.error = undefined;
          const notice = "本机服务已重新启动。正文仍已定稿，正在从保存的材料继续未完成的资料同步。";
          entry.page.messages.push({ id: randomUUID(), role: "notice", text: notice, at: Date.now() });
          try {
            savePageRecord(entry.task, entry.page);
            const opened = await this.open(entry);
            opened.hub.beginAuthorTurn();
            this.run(entry, opened.runtimeHost.session.sendCustomMessage({ customType: "noya.resume", content: `${notice} 本任务负责章节：${pending.join("、")}。原子 Agent 已退出，请根据已保存的清单和结果安排后续步骤，不重新定稿、不越过作者决定。`, display: true }, { triggerTurn: true, deliverAs: "followUp" }));
          } catch (error) { entry.page.error = errorText(error); }
          finally { entry.submitting -= 1; this.settle(); }
          return;
        } catch { /* Keep a damaged task isolated; do not redirect its work. */ }
      }
    }
  }

  command(command: PageCommand): Promise<{ accepted: true }> {
    validateCommand(command);
    const key = `${command.workId}/${command.taskId}/${command.requestId}`;
    const signature = contentHash(JSON.stringify(command));
    const pending = this.commands.get(key);
    if (pending) {
      if (pending.signature !== signature) return Promise.reject(new AppError(409, "请求标识已用于另一个操作"));
      return pending.result;
    }
    const result = this.perform(command);
    this.commands.set(key, { signature, result });
    void result.finally(() => this.commands.delete(key)).catch(() => undefined);
    return result;
  }
  private async perform(command: PageCommand): Promise<{ accepted: true }> {
    if (this.closed) throw new AppError(503, "本机服务正在退出");
    validateCommand(command);
    const entry = this.target(command);
    const signature = contentHash(JSON.stringify(command));
    const existing = entry.page.requests.find(r => r.id === command.requestId);
    if (existing) {
      if (existing.signature !== signature) throw new AppError(409, "请求标识已用于另一个操作");
      if (command.kind === "finalize" && !this.draftView(command, command.draftId).finalized) throw new AppError(409, "本次定稿未完成或正式版本已改变，请重新阅读并确认");
      return { accepted: true };
    }
    if (entry.claiming) throw new AppError(409, "任务正在承接同步，请稍后继续");
    if (command.kind === "stop") {
      if (!sameTask(this.active, command) && !entry.stopping) throw new AppError(409, "该任务当前没有执行中的工作");
      entry.stopping ??= this.stop(entry);
      try { await entry.stopping; } finally { entry.stopping = undefined; }
      entry.page.requests.push({ id: command.requestId, signature }); savePageRecord(entry.task, entry.page);
      return { accepted: true };
    }
    if (this.active && (!sameTask(this.active, command) || command.kind !== "message" || entry.page.status === "stopping")) throw new AppError(409, "已有作者任务正在执行，请返回它或先停止");
    if (command.kind === "claim-sync") {
      this.active = { workId: command.workId, taskId: command.taskId }; entry.submitting += 1; entry.claiming = true;
      try {
        await claimSync(entry.task, command.chapterId, command.version);
        entry.page.requests.push({ id: command.requestId, signature }); savePageRecord(entry.task, entry.page);
        return { accepted: true };
      } finally { entry.submitting -= 1; entry.claiming = false; this.active = null; }
    }
    if (command.kind === "message" && command.draftId) this.draftView(command, command.draftId);
    if (command.kind === "decide" && entry.page.decision?.id !== command.decisionId) throw new AppError(409, "此决定已经处理或已过期，请刷新");
    let text = command.kind === "message" ? command.text.trim() : "继续处理已保存的工作；如果有待同步章节，先继续 Context 同步。原 Agent 不可恢复时请明确说明并重新安排。";
    if (command.kind === "finalize") {
      const draft = this.draftView(command, command.draftId);
      if (draft.fingerprint !== command.fingerprint) throw new AppError(409, "正文或定稿状态已变化，请重新阅读并确认");
      if (draft.finalized) return { accepted: true };
      text = `确认将《${draft.title}》第 ${draft.version} 版（${command.draftId}）定稿${draft.replaces ? "，替换已有正式正文" : ""}。`;
    }
    // Reserve before the first asynchronous session/model initialization.
    if (this.active && (!sameTask(this.active, command) || command.kind !== "message")) throw new AppError(409, "已有作者任务正在执行");
    this.active = { workId: command.workId, taskId: command.taskId };
    entry.submitting += 1; entry.page.status = "running"; entry.page.error = undefined; entry.page.stoppedByAuthor = false;
    try {
      await repairFinalizations(entry.task.work); this.refreshFinalizations(command.workId);
      const { hub, runtimeHost } = await this.open(entry);
      if (entry.stopping || entry.page.stoppedByAuthor || String(entry.page.status) === "stopping") throw new AppError(409, "任务正在停止，请稍后继续");
      hub.beginAuthorTurn();
      entry.page.stoppedByAuthor = false;
      if (command.kind === "message") hub.selectPageDraft(command.draftId);
      const session = runtimeHost.session;
      if (command.kind === "decide") {
        const decision = entry.page.decision!;
        if (decision.fingerprint !== this.confirmationFingerprint(entry, decision.args)) {
          delete entry.page.decision; delete entry.page.approved; savePageRecord(entry.task, entry.page);
          throw new AppError(409, "作品资料已变化，这次确认已过期。请重新说明要保存的内容。");
        }
        if (!decision.options.includes(command.answer) && !command.answer.trim()) throw new AppError(400, "请填写作者决定");
        text = `针对“${decision.title}”\n${decision.detail}\n作者决定：${command.answer}\n对应内容：${JSON.stringify(decision.args)}`;
        if (decision.kind !== "direction" && command.answer === decision.options[0]) entry.page.approved = { kind: decision.kind, fingerprint: decision.fingerprint };
        delete entry.page.decision;
      }
      if (command.kind === "message") delete entry.page.approved;
      entry.page.requests.push({ id: command.requestId, signature });
      entry.page.messages.push({ id: command.requestId, role: "user", text: command.kind === "message" ? command.text : text, at: Date.now(), ...(command.kind === "message" && command.draftId ? { draftId: command.draftId } : {}) });
      savePageRecord(entry.task, entry.page);
      let prompt = `[页面作者]\n${text}`;
      if (command.kind === "message" && command.draftId) prompt += `\n\n作者正在阅读并引用稿件 ${command.draftId}。必须以此版本为准，先读取 tasks/${command.taskId}/artifacts/${command.draftId}.md；不能替换成最新版。纯措辞修改请 edit tasks/${command.taskId}/revision.md（已复制所读版本），然后 save_revision；这条路径不需要恢复旧 Writer。涉及内容的修改仍交给 Writer。`;
      if (command.kind === "finalize") {
        recordAuthorMessage(session, prompt);
        const notice = await hub.finalize(command.draftId);
        this.run(entry, session.sendCustomMessage({ customType: "noya.notice", content: notice, display: true }, { triggerTurn: true, deliverAs: "followUp" }));
      } else this.run(entry, session.prompt(prompt, { streamingBehavior: "steer" }));
      return { accepted: true };
    } catch (error) {
      if (!entry.page.stoppedByAuthor) { entry.page.error = errorText(error); entry.page.status = "failed"; }
      savePageRecord(entry.task, entry.page);
      throw error;
    } finally { entry.submitting -= 1; }
  }
  private run(entry: Entry, promise: Promise<unknown>): void {
    entry.submitting += 1;
    void promise.catch(error => { entry.page.error = errorText(error); }).finally(() => { entry.submitting -= 1; this.settle(); });
  }
  private async stop(entry: Entry): Promise<void> {
    entry.page.status = "stopping"; entry.page.stoppedByAuthor = true; savePageRecord(entry.task, entry.page);
    try {
      if (entry.opening) await entry.opening;
      await entry.opened?.hub.stopTask();
      entry.page.status = "stopped"; entry.page.stoppedAt = new Date().toISOString(); rememberEnd(entry.page, "stopped", "已停止"); entry.streaming = undefined; entry.liveText.clear(); entry.page.error = undefined;
      savePageRecord(entry.task, entry.page);
      if (sameTask(this.active, { workId: entry.task.work.workId, taskId: entry.task.taskId })) this.active = null;
    } catch (error) { entry.page.error = `停止未完成：${errorText(error)}`; savePageRecord(entry.task, entry.page); throw error; }
  }
  private settle(): void {
    if (this.closed || !this.active) return;
    const entry = this.entries.get(`${this.active.workId}/${this.active.taskId}`);
    if (!entry || entry.submitting || entry.opening || entry.page.status === "stopping") return;
    const opened = entry.opened;
    if (opened && (!opened.runtimeHost.session.isIdle || opened.hub.hasPendingWork)) return;
    const failure = entry.page.error || assistantFailure(opened?.runtimeHost.session);
    entry.page.status = failure ? "failed" : "idle";
    if (failure) rememberEnd(entry.page, "failed", "失败");
    entry.page.error = failure;
    entry.streaming = undefined;
    entry.activity = undefined;
    try { savePageRecord(entry.task, entry.page); this.active = null; }
    catch (error) { entry.page.status = "failed"; entry.page.error = `保存任务状态失败：${errorText(error)}`; }
  }
  async close(): Promise<void> {
    this.closed = true; clearInterval(this.monitor);
    for (const entry of this.entries.values()) {
      if (entry.page.status === "running") { entry.page.status = "interrupted"; rememberEnd(entry.page, "interrupted", "执行中断"); savePageRecord(entry.task, entry.page); }
      if (entry.opening) await entry.opening.catch(() => undefined);
      await entry.opened?.hub.interruptTask(); entry.opened?.hub.dispose();
    }
  }
}

function observeSession(entry: Entry, agentId: string, event: { type: string; message?: { role?: string; content?: unknown }; toolCallId?: string; toolName?: string; args?: unknown; partialResult?: unknown; parentToolCallId?: string }): void {
  if (event.type === "message_update" && event.message?.role === "assistant") {
    const text = messageText(event.message);
    if (text) entry.liveText.set(agentId, text);
    if (agentId === "context") entry.streaming = text;
  }
  if (event.type === "message_end") {
    entry.liveText.delete(agentId);
    if (agentId === "context") entry.streaming = undefined;
  }
  if (event.type === "tool_execution_start" && event.toolCallId && event.toolName) {
    entry.liveCalls.set(event.toolCallId, { id: event.toolCallId, name: event.toolName, args: event.args, at: Date.now(), agentId });
    if (agentId === "context") entry.activity = event.toolName;
  }
  if (event.type === "tool_execution_update") {
    const text = partialText(event.partialResult);
    if (text) {
      for (const id of [event.toolCallId, event.parentToolCallId]) {
        const call = id ? entry.liveCalls.get(id) : undefined;
        if (call) call.output = text;
      }
    }
  }
  if (event.type === "tool_execution_end" && event.toolCallId) entry.liveCalls.delete(event.toolCallId);
}

function rememberEnd(page: PageRecord, event: "stopped" | "failed" | "interrupted", text: string): void {
  page.marks ??= [];
  const at = Date.now();
  if (page.marks.some(mark => mark.event === event && Math.abs(mark.at - at) < 1500)) return;
  page.marks.push({ id: `${event}:${page.marks.length}:${at}`, event, text, at });
}

function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function describeChanges(value: unknown): string {
  if (!Array.isArray(value)) return JSON.stringify(value, null, 2);
  return value.map((raw, i) => {
    const change = raw.change ?? raw;
    const doc = change.doc ?? change.node ?? change;
    return `${i + 1}. ${doc.name ?? doc.title ?? change.chapter_id ?? change.id ?? "资料"} · ${change.op === "delete" ? "删除" : "更新"}\n${describeValue(doc)}${raw.evidence ? `\n正文依据：${raw.evidence.join("；")}` : ""}`;
  }).join("\n\n");
}
const fieldLabels: Record<string, string> = {
  name: "名称", title: "名称", summary: "摘要", content: "内容", aliases: "别名", kind: "类型", children: "下级资料", state: "当前状态", location_id: "所在地", attributes: "特征", abilities: "能力", possessions: "持有物", resources: "资源", relationships: "人物关系", cognition: "人物认知", key_characters: "重要登场角色", effects: "效果", requirements: "条件", limitations: "限制", status: "状态", chapter_ids: "相关章节", quantity: "数量", target_id: "关联对象", description: "说明", knowledge: "认知", notes: "备注", value: "内容", type: "类型", parent_id: "归属", order: "顺序", progress: "进展",
};
function describeValue(value: unknown): string {
  if (value === null) return "未指定";
  if (Array.isArray(value)) return value.length ? value.map(describeValue).join("；") : "无";
  if (!value || typeof value !== "object") return String(value);
  return Object.entries(value).filter(([key]) => !["schema_version", "id", "op", "chapter_id"].includes(key)).map(([key, item]) => `${fieldLabels[key] ?? key}：${describeValue(item)}`).join("\n");
}
function validateCommand(value: PageCommand): void {
  if (!value || typeof value !== "object" || typeof value.workId !== "string" || typeof value.taskId !== "string" || !isId(value.taskId) || typeof value.requestId !== "string" || !/^[\w-]{8,80}$/.test(value.requestId)) throw new AppError(400, "操作缺少有效作品、任务或请求身份");
  if (!["message", "decide", "finalize", "continue", "stop", "claim-sync"].includes(value.kind)) throw new AppError(400, "未知操作");
  if (value.kind === "claim-sync" && (typeof value.chapterId !== "string" || !isId(value.chapterId) || typeof value.version !== "string" || !value.version)) throw new AppError(400, "承接同步需要明确章节版本");
  if (value.kind === "message" && (typeof value.text !== "string" || !value.text.trim() || value.text.length > 30_000 || (value.draftId !== undefined && typeof value.draftId !== "string"))) throw new AppError(400, "请填写有效消息（最多 30000 字）");
  if (value.kind === "finalize" && (value.confirmed !== true || typeof value.draftId !== "string" || typeof value.fingerprint !== "string")) throw new AppError(400, "定稿需要明确稿件和作者确认");
  if (value.kind === "decide" && (typeof value.answer !== "string" || value.answer.length > 30_000 || typeof value.decisionId !== "string")) throw new AppError(400, "作者决定无效");
}

function sameTask(a: TaskRef | null, b: TaskRef): boolean { return !!a && a.workId === b.workId && a.taskId === b.taskId; }
