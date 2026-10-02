import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { SessionManager, type AgentSession, type ModelRuntime } from "@earendil-works/pi-coding-agent";
import {
  applyCanonChanges,
  cloneCanon,
  findById,
  findWorld,
  limitDepth,
  listCanon,
  loadCanon,
  saveCanon,
  type CanonState,
  type CanonType,
} from "./canon.ts";
import type { NoyaConfig, RoleName } from "./config.ts";
import { resolveToolPath } from "./guard.ts";
import {
  type CheckArtifact,
  type DraftMeta,
  type PackageArtifact,
  type ProposalArtifact,
  type ReviewArtifact,
  type SubagentRecord,
  type SubagentStatus,
  type TaskLayout,
  type TaskRegistry,
  type WorkLayout,
  artifactNumber,
  isArtifactId,
  listArtifactIds,
  loadDraft,
  loadPackage,
  loadRegistry,
  nextArtifactNumber,
  packageFile,
  readJsonFile,
  saveRegistry,
} from "./layout.ts";
import type { RoleBinding } from "./models.ts";
import { parsePack } from "./pack.ts";
import { reviewProblems, splitDraft } from "./review.ts";
import { checkSchema, toolValidators, validators } from "./schema.ts";
import { createRoleSession } from "./session.ts";
import { styleProblems } from "./style-lint.ts";
import { assistantFailure, authorConfirmationProblem } from "./transcript.ts";
import { contentHash, createFileExclusive, git, isId, nonWhitespaceLength, refuse, verbatimIncludes, withWriteLock } from "./util.ts";

const hubs = new Map<string, TaskHub>();
const STYLE_REFUSAL_LIMIT = 2;

const STATUS_LABEL: Record<SubagentStatus, string> = {
  running: "运行中",
  idle: "空闲",
  stopped: "已停止",
  retired: "已退役",
  terminated: "已终止",
  failed: "失败",
};

export function getHub(taskId: string): TaskHub {
  const hub = hubs.get(taskId);
  if (!hub) throw new Error(`写作任务 ${taskId} 没有登记`);
  return hub;
}

export function registerHub(hub: TaskHub): void {
  hubs.set(hub.taskId, hub);
}

function briefBlock(brief: unknown): string {
  return `# Writing Brief\n${JSON.stringify(brief, null, 2)}`;
}

function hanCount(text: string): number {
  return [...text].filter((char) => /\p{Script=Han}/u.test(char)).length;
}

function commitFiles(workDir: string, files: string[], message: string): string {
  if (files.length === 0) return "没有文件变化";
  const paths = files.map((file) => relative(workDir, file));
  const status = git(workDir, ["status", "--porcelain", "--untracked-files=all"]);
  const ours = new Set(paths);
  const others = status
    .split("\n")
    .map((line) => line.slice(3))
    .map((path) => path.split(" -> ").at(-1) ?? path)
    .filter((path) => path && !ours.has(path));
  git(workDir, ["add", "-A", "--", ...paths]);
  git(workDir, ["commit", "-m", message, "--", ...paths]);
  const commit = git(workDir, ["rev-parse", "--short", "HEAD"]);
  return `提交 ${commit}${others.length > 0 ? `\n正式区另有未提交修改：${others.join("、")}` : ""}`;
}

export class TaskHub {
  readonly taskId: string;
  readonly work: WorkLayout;
  readonly task: TaskLayout;
  readonly registry: TaskRegistry;
  readonly config: NoyaConfig;
  readonly modelRuntime: ModelRuntime;
  readonly models: Record<RoleName, RoleBinding>;
  readonly random: () => number;
  contextSession?: AgentSession;
  private readonly sessions = new Map<string, AgentSession>();
  private readonly stopRequested = new Set<string>();
  private readonly failing = new Set<string>();
  // 每个写手连续被文风检查拒绝的次数；到上限后放行，避免弱模型在同一处反复打转。
  private readonly styleRefusals = new Map<string, number>();
  private comparison: { jia: string; yi: string; chapterId: string; writerId: string } | undefined;

  constructor(
    work: WorkLayout,
    task: TaskLayout,
    registry: TaskRegistry,
    config: NoyaConfig,
    modelRuntime: ModelRuntime,
    models: Record<RoleName, RoleBinding>,
    random: () => number = Math.random,
  ) {
    this.work = work;
    this.task = task;
    this.registry = registry;
    this.config = config;
    this.modelRuntime = modelRuntime;
    this.models = models;
    this.random = random;
    this.taskId = task.taskId;
    registerHub(this);
  }

  save(): void {
    saveRegistry(this.task, this.registry);
  }

  attachContext(session: AgentSession): void {
    this.contextSession = session;
    const file = session.sessionFile ?? session.sessionManager.getSessionFile();
    if (file) this.registry.context_session_file = file;
    this.save();
  }

  cwdFor(role: RoleName, agentId?: string): string {
    if (role === "context" || !agentId) return this.work.workDir;
    return this.agent(agentId).workspaceDir;
  }

  editableFiles(): string[] {
    const writer = this.activeWriter();
    if (!writer || writer.status === "running") return [];
    return ["plan.md", "draft.md"].map((name) => resolveToolPath(name, writer.workspaceDir));
  }

  statusLine(): string {
    if (this.registry.subagents.length === 0) return "无";
    return this.registry.subagents
      .map((agent) => {
        const latest = agent.artifacts.at(-1);
        return `${agent.id} ${STATUS_LABEL[agent.status]} 输入 ${agent.inputRef}${latest ? ` 最近 ${latest}` : ""}`;
      })
      .join("；");
  }

  async finishRound(agentId: string): Promise<void> {
    const agent = this.registry.subagents.find((item) => item.id === agentId);
    if (!agent) return;
    const round = agent.rounds.at(-1);
    if (!round || round.endedAt) return;
    round.endedAt = new Date().toISOString();
    const thrown = this.failing.delete(agentId);
    const failure = assistantFailure(this.sessions.get(agentId));
    if (agent.status === "retired" || agent.status === "terminated") {
      round.outcome = "retired";
      round.note = agent.status === "terminated" ? "进程退出" : "已退役";
    } else if (this.stopRequested.delete(agentId)) {
      agent.status = "stopped";
      round.outcome = "stopped";
      round.note = "已停止";
    } else if (thrown || failure) {
      agent.status = "failed";
      agent.failureReason = agent.failureReason || failure || "模型调用失败";
      round.outcome = "failed";
      round.note = agent.failureReason;
    } else {
      agent.status = "idle";
      round.outcome = "completed";
    }
    this.save();
    await this.notify(agent, round.artifacts, round.outcome ?? "completed", round.note);
  }

  queryCanon(args: Record<string, unknown>): string {
    const state = loadCanon(this.work.workDir);
    const items = listCanon(state);
    if (args.op === "search") {
      const query = String(args.query);
      const types = args.types as CanonType[] | undefined;
      const limit = typeof args.limit === "number" ? args.limit : 20;
      const hits = items.filter((item) => (!types || types.includes(item.type)) && item.text.includes(query)).slice(0, limit);
      if (hits.length === 0) return "没有匹配的正式资料";
      return hits
        .map((item) => {
          const index = item.text.indexOf(query);
          const snippet = item.text.slice(Math.max(0, index - 24), index + query.length + 24).replace(/\s+/g, " ");
          return `${item.type}\t${item.id}\t${item.title}\t${snippet}`;
        })
        .join("\n");
    }
    if (args.op === "get") {
      const ids = [...new Set((args.ids as string[]) ?? [])];
      const lines = ids.map((id) => {
        const item = findById(state, id);
        return item ? `${item.type} ${item.id}\n${JSON.stringify(item.doc, null, 2)}` : `未找到 ${id}`;
      });
      return lines.join("\n\n");
    }
    if (args.op === "list") {
      const type = args.type as CanonType;
      const listed = items.filter((item) => item.type === type);
      if (listed.length === 0) return `没有 ${type}`;
      return listed.map((item) => `${item.id}\t${item.title}\t${item.summary}`).join("\n");
    }
    const found = findWorld(state, String(args.id));
    if (!found) refuse(`世界志节点 ${String(args.id)} 不存在`);
    const depth = typeof args.depth === "number" ? args.depth : undefined;
    return JSON.stringify(limitDepth(found.node, depth), null, 2);
  }

  writeCanon(args: Record<string, unknown>): Promise<string> {
    return withWriteLock(async () => {
      const confirmation = authorConfirmationProblem(this.requireContext(), String(args.author_confirmation ?? ""));
      if (confirmation) refuse(confirmation);
      const changes = args.changes as Record<string, unknown>[];
      const shapeErrors = changes.flatMap((change, index) => checkSchema(toolValidators.canonChange, change, `变更 ${index + 1}`));
      if (shapeErrors.length > 0) refuse(...shapeErrors);
      const before = loadCanon(this.work.workDir);
      const trial = cloneCanon(before);
      const problems = applyCanonChanges(trial, changes);
      if (problems.length > 0) refuse(...problems);
      const written = await saveCanon(this.work.workDir, before, trial);
      const labels = changes.map((change) => changeLabel(change));
      const commit = commitFiles(this.work.workDir, written, `write_canon ${labels.join(" ")} (${this.taskId})`);
      return `已写入 ${labels.join("、")}。${commit}`;
    });
  }

  async savePackage(args: Record<string, unknown>): Promise<string> {
    const pending = this.pendingProblem();
    if (pending) refuse(pending);
    const brief = args.brief;
    const pack = String(args.pack ?? "");
    const errors = [
      ...checkSchema(validators.brief, brief, "Writing Brief"),
      ...this.briefRules(brief as Record<string, unknown>, loadCanon(this.work.workDir)),
    ];
    if (errors.length === 0) {
      const parsed = parsePack(pack, loadCanon(this.work.workDir), String((brief as Record<string, unknown>).id));
      errors.push(...parsed.errors);
    }
    if (errors.length > 0) refuse(...errors);
    const briefRecord = brief as Record<string, unknown>;
    return withWriteLock(async () => {
      const id = `package_${nextArtifactNumber(this.task.artifactsDir, "package")}`;
      const artifact: PackageArtifact = { id, brief: briefRecord, pack };
      await createFileExclusive(packageFile(this.task, id), `${JSON.stringify(artifact, null, 2)}\n`);
      return id;
    });
  }

  async saveRevision(): Promise<string> {
    const writer = this.activeWriter();
    if (!writer || !writer.packageId) refuse("没有活跃 Writer");
    if (writer.status === "running") refuse("Writer 仍在运行");
    return this.snapshotDraft(writer, join(writer.workspaceDir, "draft.md"));
  }

  async saveSyncProposal(args: Record<string, unknown>): Promise<string> {
    const chapterId = String(args.chapter_id ?? "");
    const changes = (args.changes as Array<Record<string, unknown>>) ?? [];
    const state = loadCanon(this.work.workDir);
    const errors: string[] = [];
    if (!state.sync.pending_chapter_ids.includes(chapterId)) errors.push(`章节 ${chapterId} 不在待同步列表中`);
    if (!isId(chapterId)) errors.push(`章节 ID「${chapterId}」不符合格式`);
    const chapter = state.chapters.get(chapterId);
    const seen = new Set<string>();
    const canonChanges: Record<string, unknown>[] = [];
    for (const change of changes) {
      const id = String(change.id ?? "");
      if (!isId(id)) errors.push(`变更 ID「${id}」不符合格式`);
      if (seen.has(id)) errors.push(`变更 ID「${id}」重复`);
      seen.add(id);
      if (!String(change.rationale ?? "").trim()) errors.push(`变更 ${id} 缺少理由`);
      const evidence = Array.isArray(change.evidence) ? (change.evidence as string[]) : [];
      if (evidence.length === 0) errors.push(`变更 ${id} 缺少依据`);
      for (const excerpt of evidence) {
        if (nonWhitespaceLength(excerpt) < 4) errors.push(`变更 ${id} 的依据摘录太短`);
        else if (!chapter || !verbatimIncludes(chapter.content, excerpt)) errors.push(`变更 ${id} 的依据摘录没有出现在定稿正文中`);
      }
      const body = change.change as Record<string, unknown>;
      if (body?.type === "chapter_meta") {
        errors.push(...checkSchema(toolValidators.chapterMeta, body, `变更 ${id}`));
        if (body.chapter_id !== chapterId) errors.push(`chapter_meta 只能针对章节 ${chapterId}`);
      } else {
        errors.push(...checkSchema(toolValidators.canonChange, body, `变更 ${id}`));
      }
      canonChanges.push(body);
    }
    if (errors.length === 0 && chapter) {
      const trial = cloneCanon(state);
      errors.push(...applyCanonChanges(trial, canonChanges));
    }
    if (errors.length > 0) refuse(...[...new Set(errors)]);
    const savedContent = chapter?.content ?? "";
    return withWriteLock(async () => {
      const fresh = loadCanon(this.work.workDir).chapters.get(chapterId);
      if (!fresh) refuse(`章节 ${chapterId} 不存在`);
      if (contentHash(fresh.content) !== contentHash(savedContent)) refuse("定稿正文在保存清单前发生了变化");
      const id = `proposal_${nextArtifactNumber(this.task.artifactsDir, "proposal")}`;
      const artifact: ProposalArtifact = {
        proposal_id: id,
        chapter_id: chapterId,
        chapter_content_sha256: contentHash(fresh.content),
        changes,
      };
      await createFileExclusive(join(this.task.artifactsDir, `${id}.json`), `${JSON.stringify(artifact, null, 2)}\n`);
      return id;
    });
  }

  applySync(args: Record<string, unknown>): Promise<string> {
    return withWriteLock(async () => {
      const proposalId = String(args.proposal_id ?? "");
      if (!isArtifactId(proposalId, "proposal")) refuse(`产物 ID「${proposalId}」不符合 proposal_数字 的格式`);
      const proposal = this.loadProposal(proposalId);
      if (!proposal) refuse(`同步清单 ${proposalId} 不存在`);
      const check = this.latestCheck(proposalId);
      if (!check) refuse(`同步清单 ${proposalId} 还没有核对结果`);
      const selected = args.change_ids as string[];
      const verdicts = new Map(check.verdicts.map((verdict) => [String(verdict.change_id), String(verdict.verdict)]));
      const missing = selected.filter((id) => !proposal.changes.some((change) => change.id === id));
      if (missing.length > 0) refuse(`同步清单中没有变更 ${missing.join("、")}`);
      const beforePreview = loadCanon(this.work.workDir);
      const currentChapter = beforePreview.chapters.get(proposal.chapter_id);
      if (!currentChapter) refuse(`章节 ${proposal.chapter_id} 不存在`);
      if (!proposal.chapter_content_sha256) refuse(`同步清单 ${proposalId} 没有记录它所依据的定稿正文`);
      if (contentHash(currentChapter.content) !== proposal.chapter_content_sha256) {
        refuse(`章节 ${proposal.chapter_id} 的定稿正文已经和这份清单不一致`);
      }
      const stale = proposal.changes.filter((change) => selected.includes(String(change.id))).flatMap((change) => {
        const evidence = Array.isArray(change.evidence) ? (change.evidence as unknown[]) : [];
        return evidence.flatMap((excerpt) =>
          typeof excerpt === "string" && verbatimIncludes(currentChapter.content, excerpt)
            ? []
            : [`变更 ${String(change.id)} 的依据摘录没有出现在当前定稿正文中`],
        );
      });
      if (stale.length > 0) refuse(...stale);
      const needsConfirmation = selected.some((id) => verdicts.get(id) !== "supported");
      if (needsConfirmation) {
        const problem = authorConfirmationProblem(this.requireContext(), typeof args.author_confirmation === "string" ? args.author_confirmation : undefined);
        if (problem) refuse(problem);
      }
      const chosen = proposal.changes.filter((change) => selected.includes(String(change.id))).map((change) => change.change as Record<string, unknown>);
      const before = beforePreview;
      const trial = cloneCanon(before);
      const problems = applyCanonChanges(trial, chosen);
      if (problems.length > 0) refuse(...problems);
      const chapter = trial.chapters.get(proposal.chapter_id);
      if (chapter && chapter.summary.trim()) {
        trial.sync.pending_chapter_ids = trial.sync.pending_chapter_ids.filter((id) => id !== proposal.chapter_id);
      }
      const written = await saveCanon(this.work.workDir, before, trial);
      const commit = commitFiles(this.work.workDir, written, `apply_sync ${proposalId} (${this.taskId} / ${proposalId})`);
      return `已应用 ${selected.join("、")}。${commit}`;
    });
  }

  async spawnSubagent(args: Record<string, unknown>): Promise<string> {
    const role = String(args.role) as SubagentRecord["role"];
    if (role === "writer") {
      const packageId = String(args.package_id ?? "");
      if (!isArtifactId(packageId, "package")) refuse(`产物 ID「${packageId}」不符合 package_数字 的格式`);
      return this.spawnWriter(packageId);
    }
    if (role === "reviewer") {
      const draftId = String(args.draft_id ?? "");
      if (!isArtifactId(draftId, "draft")) refuse(`产物 ID「${draftId}」不符合 draft_数字 的格式`);
      return this.spawnReviewer(draftId);
    }
    const proposalId = String(args.proposal_id ?? "");
    if (!isArtifactId(proposalId, "proposal")) refuse(`产物 ID「${proposalId}」不符合 proposal_数字 的格式`);
    return this.spawnChecker(proposalId);
  }

  async sendMessage(args: Record<string, unknown>): Promise<string> {
    const agent = this.agent(String(args.agent_id));
    if (agent.role !== "writer") refuse("只能向 Writer 发送消息");
    if (agent.status === "retired" || agent.status === "terminated" || agent.status === "failed") {
      refuse(`Writer 状态为${STATUS_LABEL[agent.status]}，不能发送消息`);
    }
    const session = await this.ensureWriterSession(agent);
    if (!session) refuse("Writer 会话不存在");
    if (typeof args.package_id === "string") {
      if (!isArtifactId(args.package_id, "package")) refuse(`产物 ID「${args.package_id}」不符合 package_数字 的格式`);
      const next = loadPackage(this.task, args.package_id);
      const current = agent.packageId ? loadPackage(this.task, agent.packageId) : undefined;
      if (!next || !current) refuse("Package 不存在");
      if (next.brief.chapter_id !== current.brief.chapter_id) refuse("新 Package 的 chapter_id 必须与当前绑定相同");
      agent.packageId = next.id;
      agent.inputRef = next.id;
      this.save();
    }
    const pkg = agent.packageId ? loadPackage(this.task, agent.packageId) : undefined;
    if (!pkg) refuse("Writer 没有绑定 Package");
    const text = `${String(args.message ?? "")}\n\n${briefBlock(pkg.brief)}`;
    if (agent.status === "running") {
      await session.steer(text);
      return "消息将在 Writer 下一次模型调用前送达";
    }
    this.launch(agent, text);
    return "已开始新一轮";
  }

  async stopSubagent(args: Record<string, unknown>): Promise<string> {
    const agent = this.agent(String(args.agent_id));
    if (agent.status === "running") {
      this.stopRequested.add(agent.id);
      await this.sessions.get(agent.id)?.abort();
      return `${agent.id} 已停止`;
    }
    if (agent.status === "idle") {
      agent.status = "stopped";
      this.save();
      await this.notify(agent, [], "stopped", "已停止");
      return `${agent.id} 已停止`;
    }
    refuse(`不能停止状态为${STATUS_LABEL[agent.status]}的 ${agent.id}`);
  }

  async stopAll(): Promise<void> {
    const running = this.registry.subagents.filter((agent) => agent.status === "running");
    for (const agent of running) await this.stopSubagent({ agent_id: agent.id });
  }

  getSubagents(args: Record<string, unknown>): string {
    if (!args.agent_id) {
      if (this.registry.subagents.length === 0) return "没有 Subagent";
      return this.registry.subagents.map((agent) => `${agent.id} ${STATUS_LABEL[agent.status]}`).join("\n");
    }
    const agent = this.agent(String(args.agent_id));
    return [
      `角色：${agent.role}`,
      `状态：${STATUS_LABEL[agent.status]}`,
      `输入：${agent.inputRef}`,
      `最近产物：${agent.artifacts.at(-1) ?? "无"}`,
      `失败原因：${agent.failureReason ?? "无"}`,
    ].join("\n");
  }

  submitPlan(agentId: string): Promise<string> {
    const agent = this.agent(agentId);
    this.requireSubmittable(agent);
    const file = join(agent.workspaceDir, "plan.md");
    if (!existsSync(file)) refuse("还没有方案文件 plan.md");
    const text = readFileSync(file, "utf8");
    if (!/\S/.test(text)) refuse("方案为空");
    this.requireSubmittable(agent);
    return withWriteLock(async () => {
      this.requireSubmittable(agent);
      const id = `plan_${nextArtifactNumber(this.task.artifactsDir, "plan")}`;
      await createFileExclusive(join(this.task.artifactsDir, `${id}.md`), text);
      this.noteArtifact(agent, id);
      return id;
    });
  }

  submitDraft(agentId: string): Promise<string> {
    const agent = this.agent(agentId);
    this.requireSubmittable(agent);
    if (!agent.artifacts.some((id) => id.startsWith("plan_"))) refuse("提交初稿前必须先提交章节方案");
    const file = join(agent.workspaceDir, "draft.md");
    const split = existsSync(file) ? splitDraft(readFileSync(file, "utf8")) : undefined;
    const problems = split && !("error" in split) ? styleProblems(split.content) : [];
    const refused = this.styleRefusals.get(agent.id) ?? 0;
    if (problems.length > 0 && refused < STYLE_REFUSAL_LIMIT) {
      this.styleRefusals.set(agent.id, refused + 1);
      refuse("文风检查未通过，按下列问题修改 draft.md 后再次提交：", ...problems);
    }
    this.styleRefusals.delete(agent.id);
    const submitted = this.snapshotDraft(agent, file);
    if (problems.length === 0) return submitted;
    return submitted.then((id) => [id, "文风检查仍有问题，已随稿提交：", ...problems.map((problem) => `- ${problem}`)].join("\n"));
  }

  async saveReview(agentId: string, args: Record<string, unknown>): Promise<string> {
    const agent = this.agent(agentId);
    const draft = loadDraft(this.task, agent.inputRef);
    if (!draft) refuse("被检查的初稿不存在");
    const pkg = loadPackage(this.task, draft.meta.package_id);
    if (!pkg) refuse("初稿所属 Package 不存在");
    const parsed = parsePack(pkg.pack, undefined, String(pkg.brief.id));
    const problems = [...parsed.errors, ...reviewProblems(args.review, draft.markdown, pkg.brief, parsed.sections)];
    if (problems.length > 0) refuse(...problems);
    return withWriteLock(async () => {
      const id = `review_${nextArtifactNumber(this.task.artifactsDir, "review")}`;
      const artifact: ReviewArtifact = {
        review_id: id,
        draft_id: draft.meta.draft_id,
        chapter_id: String(pkg.brief.chapter_id),
        review: args.review as Record<string, unknown>,
      };
      await createFileExclusive(join(this.task.artifactsDir, `${id}.json`), `${JSON.stringify(artifact, null, 2)}\n`);
      this.noteArtifact(agent, id);
      return id;
    });
  }

  async saveSyncCheck(agentId: string, args: Record<string, unknown>): Promise<string> {
    const agent = this.agent(agentId);
    const proposal = this.loadProposal(agent.inputRef);
    if (!proposal) refuse("核对的变更清单不存在");
    const verdicts = (args.verdicts as Array<Record<string, unknown>>) ?? [];
    const expected = proposal.changes.map((change) => String(change.id));
    const got = verdicts.map((verdict) => String(verdict.change_id));
    const errors: string[] = [];
    if (got.length !== expected.length || new Set(got).size !== got.length || expected.some((id) => !got.includes(id))) {
      errors.push("清单中的每条变更都要有恰好一条结论");
    }
    const known = new Set(listCanon(loadCanon(this.work.workDir)).map((item) => item.id));
    for (const doc of loadCanon(this.work.workDir).characters.values()) {
      const record = doc;
      for (const possession of (record.possessions as Array<{ id?: string }> | undefined) ?? []) if (possession.id) known.add(possession.id);
      for (const cognition of (record.cognition as Array<{ id?: string }> | undefined) ?? []) if (cognition.id) known.add(cognition.id);
    }
    for (const verdict of verdicts) {
      const ids = (verdict.conflicting_ids as string[]) ?? [];
      if (!String(verdict.reason ?? "").trim()) errors.push(`变更 ${String(verdict.change_id)} 缺少理由`);
      if (verdict.verdict === "conflict") {
        if (ids.length === 0) errors.push(`变更 ${String(verdict.change_id)} 的冲突结论必须列出 conflicting_ids`);
        for (const id of ids) if (!known.has(id)) errors.push(`冲突对象 ${id} 不存在`);
      } else if (ids.length > 0) errors.push(`变更 ${String(verdict.change_id)} 只有冲突结论可以列出 conflicting_ids`);
    }
    if (errors.length > 0) refuse(...errors);
    return withWriteLock(async () => {
      const id = `check_${nextArtifactNumber(this.task.artifactsDir, "check")}`;
      const artifact: CheckArtifact = { check_id: id, proposal_id: proposal.proposal_id, verdicts };
      await createFileExclusive(join(this.task.artifactsDir, `${id}.json`), `${JSON.stringify(artifact, null, 2)}\n`);
      this.noteArtifact(agent, id);
      return id;
    });
  }

  async finalize(draftArg: string): Promise<string> {
    if (draftArg && !isArtifactId(draftArg, "draft")) refuse(`产物 ID「${draftArg}」不符合 draft_数字 的格式`);
    const draftId = draftArg || listArtifactIds(this.task, "draft").at(-1);
    if (!draftId) refuse("没有可定稿的初稿");
    const draft = loadDraft(this.task, draftId);
    if (!draft) refuse(`初稿 ${draftId} 不存在`);
    const split = splitDraft(draft.markdown);
    if ("error" in split) refuse(split.error);
    const chapterId = draft.meta.chapter_id;
    return withWriteLock(async () => {
      const before = loadCanon(this.work.workDir);
      const trial = cloneCanon(before);
      const existing = trial.chapters.get(chapterId);
      const order = existing?.order ?? Math.max(0, ...[...trial.chapters.values()].map((chapter) => chapter.order)) + 1;
      trial.chapters.set(chapterId, {
        schema_version: 1,
        id: chapterId,
        title: split.title,
        order,
        status: "finalized",
        content: split.content,
        summary: "",
        key_characters: [],
      });
      if (!trial.sync.pending_chapter_ids.includes(chapterId)) trial.sync.pending_chapter_ids.push(chapterId);
      const problems = applyCanonChanges(trial, []);
      if (problems.length > 0) refuse(...problems);
      const written = await saveCanon(this.work.workDir, before, trial);
      const commit = commitFiles(this.work.workDir, written, `finalize ${chapterId} (${this.taskId} / ${draftId})`);
      this.registry.finalizations.push({ chapter_id: chapterId, draft_id: draftId, at: new Date().toISOString() });
      this.save();
      const notice = `${chapterId} 已定稿，请进行 Context 同步`;
      const extra = commit.includes("未提交修改") ? `\n${commit.slice(commit.indexOf("正式区"))}` : "";
      return `${notice}${extra}`;
    });
  }

  compare(): string {
    const drafts = listArtifactIds(this.task, "draft")
      .map((id) => loadDraft(this.task, id))
      .filter((draft): draft is NonNullable<typeof draft> => !!draft);
    const latest = drafts.at(-1);
    if (!latest) refuse("无法比较，还没有初稿");
    const owned = drafts.filter((draft) => draft.meta.writer_id === latest.meta.writer_id);
    const first = owned[0];
    const last = owned.at(-1);
    if (!first || !last || first.meta.draft_id === last.meta.draft_id) refuse("无法比较，需要同一 Writer 的两个不同初稿");
    const swap = this.random() >= 0.5;
    const jia = swap ? last : first;
    const yi = swap ? first : last;
    const directory = join(this.work.runtimeDir, "compare", this.taskId);
    mkdirSync(directory, { recursive: true });
    const jiaPath = join(directory, "甲.md");
    const yiPath = join(directory, "乙.md");
    writeFileSync(jiaPath, jia.markdown.endsWith("\n") ? jia.markdown : `${jia.markdown}\n`);
    writeFileSync(yiPath, yi.markdown.endsWith("\n") ? yi.markdown : `${yi.markdown}\n`);
    const mapping = {
      jia: jia.meta.draft_id,
      yi: yi.meta.draft_id,
      chapter_id: latest.meta.chapter_id,
      writer_id: latest.meta.writer_id,
    };
    mkdirSync(join(this.work.runtimeDir, "compare"), { recursive: true });
    writeFileSync(this.mappingFile(), `${JSON.stringify(mapping, null, 2)}\n`);
    this.comparison = { jia: mapping.jia, yi: mapping.yi, chapterId: mapping.chapter_id, writerId: mapping.writer_id };
    return `请阅读甲、乙两份正文。\n甲 ${jiaPath}\n乙 ${yiPath}`;
  }

  comparePick(input: string): string {
    const comparison = this.currentComparison();
    if (!comparison) refuse("没有进行中的对照比较");
    this.comparison = comparison;
    const choice = (["都不好", "甲", "乙"] as const).find((item) => input === item || input.startsWith(`${item} `));
    if (!choice) refuse("选择必须是甲、乙或都不好");
    const reason = input.slice(choice.length).trim();
    const jia = loadDraft(this.task, comparison.jia);
    const yi = loadDraft(this.task, comparison.yi);
    if (!jia || !yi) refuse("对照的初稿已不存在");
    const writerDrafts = listArtifactIds(this.task, "draft")
      .map((id) => loadDraft(this.task, id))
      .filter((draft): draft is NonNullable<typeof draft> => !!draft && draft.meta.writer_id === comparison.writerId);
    const low = Math.min(artifactNumber(comparison.jia), artifactNumber(comparison.yi));
    const high = Math.max(artifactNumber(comparison.jia), artifactNumber(comparison.yi));
    const covered = new Set(
      writerDrafts.filter((draft) => {
        const number = artifactNumber(draft.meta.draft_id);
        return number >= low && number <= high;
      }).map((draft) => draft.meta.draft_id),
    );
    const reviewCount = listArtifactIds(this.task, "review")
      .map((id) => readJsonFile<ReviewArtifact>(join(this.task.artifactsDir, `${id}.json`)))
      .filter((review) => covered.has(review.draft_id)).length;
    const record = {
      task_id: this.taskId,
      chapter_id: comparison.chapterId,
      draft_ids: [comparison.jia, comparison.yi],
      mapping: { 甲: comparison.jia, 乙: comparison.yi },
      choice,
      reason,
      char_counts: { 甲: hanCount(jia.markdown), 乙: hanCount(yi.markdown) },
      review_count: reviewCount,
      time: new Date().toISOString(),
    };
    mkdirSync(this.work.runtimeDir, { recursive: true });
    appendFileSync(join(this.work.runtimeDir, "evaluations.jsonl"), `${JSON.stringify(record)}\n`);
    const reveal = `揭晓：甲 = ${comparison.jia}，乙 = ${comparison.yi}`;
    this.comparison = undefined;
    if (existsSync(this.mappingFile())) unlinkSync(this.mappingFile());
    return reveal;
  }

  private mappingFile(): string {
    return join(this.work.runtimeDir, "compare", `${this.taskId}.json`);
  }

  private currentComparison(): { jia: string; yi: string; chapterId: string; writerId: string } | undefined {
    if (this.comparison) return this.comparison;
    if (!existsSync(this.mappingFile())) return undefined;
    const parsed = readJsonFile<{ jia?: string; yi?: string; chapter_id?: string; writer_id?: string }>(this.mappingFile());
    if (!parsed.jia || !parsed.yi || !isArtifactId(parsed.jia, "draft") || !isArtifactId(parsed.yi, "draft")) return undefined;
    const jia = loadDraft(this.task, parsed.jia);
    const yi = loadDraft(this.task, parsed.yi);
    if (!jia || !yi) return undefined;
    return {
      jia: parsed.jia,
      yi: parsed.yi,
      chapterId: parsed.chapter_id || jia.meta.chapter_id,
      writerId: parsed.writer_id || jia.meta.writer_id,
    };
  }

  private async spawnWriter(packageId: string): Promise<string> {
    const pending = this.pendingProblem();
    if (pending) refuse(pending);
    const pkg = loadPackage(this.task, packageId);
    if (!pkg) refuse(`Package ${packageId} 不存在`);
    await this.retireWriters();
    const id = this.nextAgentId("writer");
    const workspace = join(this.task.agentsDir, id);
    mkdirSync(join(workspace, "input"), { recursive: true });
    writeFileSync(join(workspace, "input", "brief.json"), `${JSON.stringify(pkg.brief, null, 2)}\n`);
    writeFileSync(join(workspace, "input", "pack.md"), pkg.pack.endsWith("\n") ? pkg.pack : `${pkg.pack}\n`);
    const agent = this.remember(id, "writer", packageId, workspace, packageId);
    await this.openSubagent(agent, workspace, [briefBlock(pkg.brief), "", "# Context Pack", pkg.pack.trimEnd(), "", "方案文件：plan.md", "初稿文件：draft.md"].join("\n"));
    return id;
  }

  private async spawnReviewer(draftId: string): Promise<string> {
    const draft = loadDraft(this.task, draftId);
    if (!draft) refuse(`初稿 ${draftId} 不存在`);
    const pkg = loadPackage(this.task, draft.meta.package_id);
    if (!pkg) refuse("初稿所属 Package 不存在");
    const id = this.nextAgentId("reviewer");
    const workspace = join(this.task.agentsDir, id, "input");
    mkdirSync(workspace, { recursive: true });
    writeFileSync(join(workspace, "brief.json"), `${JSON.stringify(pkg.brief, null, 2)}\n`);
    writeFileSync(join(workspace, "pack.md"), pkg.pack.endsWith("\n") ? pkg.pack : `${pkg.pack}\n`);
    writeFileSync(join(workspace, "draft.md"), draft.markdown.endsWith("\n") ? draft.markdown : `${draft.markdown}\n`);
    const agent = this.remember(id, "reviewer", draftId, workspace);
    await this.openSubagent(agent, workspace, [briefBlock(pkg.brief), "", "# Context Pack", pkg.pack.trimEnd(), "", "# 初稿", draft.markdown.trimEnd()].join("\n"));
    return id;
  }

  private async spawnChecker(proposalId: string): Promise<string> {
    const proposal = this.loadProposal(proposalId);
    if (!proposal) refuse(`同步清单 ${proposalId} 不存在`);
    const chapter = loadCanon(this.work.workDir).chapters.get(proposal.chapter_id);
    if (!chapter) refuse(`章节 ${proposal.chapter_id} 不存在`);
    const id = this.nextAgentId("sync_checker");
    const workspace = join(this.task.agentsDir, id, "input");
    mkdirSync(workspace, { recursive: true });
    writeFileSync(join(workspace, "proposal.json"), `${JSON.stringify(proposal, null, 2)}\n`);
    writeFileSync(join(workspace, "chapter.md"), chapter.content.endsWith("\n") ? chapter.content : `${chapter.content}\n`);
    const agent = this.remember(id, "sync_checker", proposalId, workspace);
    await this.openSubagent(agent, workspace, ["# 变更清单", JSON.stringify(proposal, null, 2), "", "# 定稿正文", chapter.content].join("\n"));
    return id;
  }

  private async openSubagent(agent: SubagentRecord, cwd: string, prompt: string): Promise<void> {
    const binding = this.models[agent.role];
    const created = await createRoleSession({
      role: agent.role,
      cwd,
      agentDir: this.work.agentDir,
      modelRuntime: this.modelRuntime,
      model: binding.model,
      thinking: binding.thinking,
      sessionManager: SessionManager.create(cwd, this.task.sessionDir),
      taskId: this.taskId,
      agentId: agent.id,
      skillsDir: this.config.skillsDir,
      promptFile: this.config.prompts[agent.role],
    });
    this.sessions.set(agent.id, created.session);
    agent.sessionFile = created.session.sessionFile ?? created.session.sessionManager.getSessionFile() ?? "";
    this.save();
    this.launch(agent, prompt);
  }

  private launch(agent: SubagentRecord, prompt: string): void {
    const session = this.sessions.get(agent.id);
    if (!session) refuse(`${agent.id} 会话不存在`);
    agent.rounds.push({ startedAt: new Date().toISOString(), artifacts: [] });
    agent.status = "running";
    this.save();
    void session.prompt(prompt).catch((error: unknown) => {
      if (agent.status === "retired" || agent.status === "terminated" || this.stopRequested.has(agent.id)) {
        void this.finishRound(agent.id).catch(() => undefined);
        return;
      }
      agent.failureReason = error instanceof Error ? error.message : String(error);
      this.failing.add(agent.id);
      void this.finishRound(agent.id).catch(() => undefined);
    });
  }

  private async retireWriters(): Promise<void> {
    const active = this.registry.subagents.filter(
      (agent) => agent.role === "writer" && ["running", "idle", "stopped"].includes(agent.status),
    );
    for (const agent of active) {
      const running = agent.status === "running";
      agent.status = "retired";
      this.save();
      if (!running) continue;
      await this.sessions.get(agent.id)?.abort().catch(() => undefined);
      await this.finishRound(agent.id);
    }
  }

  private async ensureWriterSession(agent: SubagentRecord): Promise<AgentSession | undefined> {
    const existing = this.sessions.get(agent.id);
    if (existing) return existing;
    if (agent.role !== "writer" || (agent.status !== "stopped" && agent.status !== "idle") || !agent.sessionFile) return undefined;
    if (!existsSync(agent.sessionFile)) return undefined;
    const binding = this.models.writer;
    const created = await createRoleSession({
      role: "writer",
      cwd: agent.workspaceDir,
      agentDir: this.work.agentDir,
      modelRuntime: this.modelRuntime,
      model: binding.model,
      thinking: binding.thinking,
      sessionManager: SessionManager.open(agent.sessionFile, this.task.sessionDir, agent.workspaceDir),
      taskId: this.taskId,
      agentId: agent.id,
      skillsDir: this.config.skillsDir,
      promptFile: this.config.prompts.writer,
    });
    this.sessions.set(agent.id, created.session);
    return created.session;
  }

  private requireSubmittable(agent: SubagentRecord): void {
    if (this.stopRequested.has(agent.id) || agent.status === "retired" || agent.status === "terminated" || agent.status === "failed") {
      refuse(`Writer 状态为${STATUS_LABEL[agent.status]}，不能提交`);
    }
  }

  private remember(id: string, role: SubagentRecord["role"], inputRef: string, workspaceDir: string, packageId?: string): SubagentRecord {
    const agent: SubagentRecord = {
      id,
      role,
      sessionFile: "",
      inputRef,
      status: "idle",
      ...(packageId ? { packageId } : {}),
      artifacts: [],
      rounds: [],
      workspaceDir,
    };
    this.registry.subagents.push(agent);
    this.save();
    return agent;
  }

  private nextAgentId(role: SubagentRecord["role"]): string {
    const prefix = role === "sync_checker" ? "sync_checker" : role;
    const numbers = this.registry.subagents.filter((agent) => agent.role === role).map((agent) => artifactNumber(agent.id.replace("-", "_")));
    return `${prefix}-${Math.max(0, ...numbers) + 1}`;
  }

  private noteArtifact(agent: SubagentRecord, artifactId: string): void {
    agent.artifacts.push(artifactId);
    const round = [...agent.rounds].reverse().find((item) => !item.endedAt);
    round?.artifacts.push(artifactId);
    this.save();
  }

  private snapshotDraft(agent: SubagentRecord, file: string): Promise<string> {
    if (!existsSync(file)) refuse("还没有初稿文件 draft.md");
    const markdown = readFileSync(file, "utf8");
    const split = splitDraft(markdown);
    if ("error" in split) refuse(split.error);
    const pkg = agent.packageId ? loadPackage(this.task, agent.packageId) : undefined;
    if (!pkg) refuse("Writer 没有绑定 Package");
    const body = markdown.endsWith("\n") ? markdown : `${markdown}\n`;
    return withWriteLock(async () => {
      const id = `draft_${nextArtifactNumber(this.task.artifactsDir, "draft")}`;
      const meta: DraftMeta = {
        draft_id: id,
        writer_id: agent.id,
        package_id: pkg.id,
        chapter_id: String(pkg.brief.chapter_id),
      };
      await createFileExclusive(join(this.task.artifactsDir, `${id}.json`), `${JSON.stringify(meta, null, 2)}\n`);
      await createFileExclusive(join(this.task.artifactsDir, `${id}.md`), body);
      this.noteArtifact(agent, id);
      return id;
    });
  }

  private pendingProblem(): string | undefined {
    const ids = loadCanon(this.work.workDir).sync.pending_chapter_ids;
    if (ids.length === 0) return undefined;
    return `有待同步章节：${ids.join("、")}`;
  }

  private briefRules(brief: Record<string, unknown> | undefined, state: CanonState): string[] {
    if (!brief) return ["缺少 Brief"];
    const errors: string[] = [];
    const briefId = String(brief.id ?? "");
    const chapterId = String(brief.chapter_id ?? "");
    if (!isId(briefId)) errors.push(`Brief ID「${briefId}」不符合格式`);
    if (!isId(chapterId)) errors.push(`chapter_id「${chapterId}」不符合格式`);
    const chapter = state.chapters.get(chapterId);
    const otherIds = new Set<string>();
    for (const item of listCanon(state)) if (item.type !== "chapter") otherIds.add(item.id);
    for (const doc of state.characters.values()) {
      for (const possession of (doc.possessions as Array<{ id?: string }> | undefined) ?? []) if (possession.id) otherIds.add(possession.id);
      for (const cognition of (doc.cognition as Array<{ id?: string }> | undefined) ?? []) if (cognition.id) otherIds.add(cognition.id);
    }
    if (brief.mode === "write_chapter") {
      if (chapter?.status === "finalized") errors.push(`chapter_id ${chapterId} 已定稿，不能作为新写章节`);
      if (otherIds.has(chapterId)) errors.push(`chapter_id ${chapterId} 与已有的非章节资料重名`);
    } else if (chapter?.status !== "finalized") errors.push(`rewrite_chapter 的 chapter_id ${chapterId} 必须是已定稿章节`);
    return errors;
  }

  private activeWriter(): SubagentRecord | undefined {
    return [...this.registry.subagents].reverse().find((agent) => agent.role === "writer" && ["running", "idle", "stopped"].includes(agent.status));
  }

  private agent(agentId: string): SubagentRecord {
    const agent = this.registry.subagents.find((item) => item.id === agentId);
    if (!agent) refuse(`Subagent ${agentId} 不存在`);
    return agent;
  }

  private requireContext(): AgentSession {
    if (!this.contextSession) refuse("Context 会话不存在");
    return this.contextSession;
  }

  private loadProposal(id: string): ProposalArtifact | undefined {
    if (!isArtifactId(id, "proposal")) return undefined;
    const file = join(this.task.artifactsDir, `${id}.json`);
    if (!existsSync(file)) return undefined;
    const parsed = readJsonFile<ProposalArtifact>(file);
    return parsed.proposal_id ? parsed : undefined;
  }

  private latestCheck(proposalId: string): CheckArtifact | undefined {
    const checks = listArtifactIds(this.task, "check")
      .map((id) => readJsonFile<CheckArtifact>(join(this.task.artifactsDir, `${id}.json`)))
      .filter((check) => check.proposal_id === proposalId);
    return checks.at(-1);
  }

  private async notify(agent: SubagentRecord, artifacts: string[], outcome: string, note?: string): Promise<void> {
    let text: string;
    if (outcome === "failed") text = `[${agent.id} 失败] ${note ?? ""}`;
    else if (outcome === "stopped" || outcome === "retired") {
      text = artifacts.length > 0 ? `[${agent.id} 结束] 本轮提交：${artifacts.join("、")} ${note ?? ""}` : `[${agent.id} 结束，未提交产物] ${note ?? ""}`;
    } else if (artifacts.length > 0) text = `[${agent.id} 完成] 本轮提交：${artifacts.join("、")}`;
    else text = `[${agent.id} 结束，未提交产物] ${(this.sessions.get(agent.id)?.getLastAssistantText() ?? "").slice(0, 200)}`;
    await this.contextSession?.sendCustomMessage(
      { customType: "noya.notice", content: text.trim(), display: true },
      { triggerTurn: true, deliverAs: "followUp" },
    );
  }
}

function changeLabel(change: Record<string, unknown>): string {
  if (change.op === "delete") return `${String(change.type)}:${String(change.id)}`;
  if (change.type === "world_node") return `world_node:${String((change.node as { id?: string } | undefined)?.id ?? "")}`;
  if (change.type === "outline_node") return `outline_node:${String((change.node as { id?: string } | undefined)?.id ?? "")}`;
  if (change.type === "chapter_meta") return `chapter_meta:${String(change.chapter_id ?? "")}`;
  const doc = change.doc as { id?: string } | undefined;
  return `${String(change.type)}:${String(doc?.id ?? "")}`;
}

export function reloadHub(task: TaskLayout, config: NoyaConfig, runtime: ModelRuntime, models: Record<RoleName, RoleBinding>, random?: () => number): TaskHub {
  const registry = loadRegistry(task);
  return new TaskHub(task.work, task, registry, config, runtime, models, random);
}

