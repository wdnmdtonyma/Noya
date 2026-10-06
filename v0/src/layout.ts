import { randomBytes } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { writeInitialCanon } from "./canon.ts";
import { git, isId } from "./util.ts";

export interface WorkLayout {
  worksRoot: string;
  workId: string;
  workDir: string;
  runtimeDir: string;
  agentDir: string;
}

export interface TaskLayout {
  work: WorkLayout;
  taskId: string;
  taskDir: string;
  artifactsDir: string;
  agentsDir: string;
  registryFile: string;
  sessionDir: string;
}

export function newDomainId(prefix: string): string {
  const id = `${prefix}${randomBytes(4).toString("hex")}`;
  if (!isId(id)) throw new Error(`生成了非法 ID ${id}`);
  return id;
}

export function workLayout(worksRoot: string, workId: string, agentDir: string): WorkLayout {
  return {
    worksRoot: resolve(worksRoot),
    workId,
    workDir: resolve(worksRoot, workId),
    runtimeDir: resolve(worksRoot, ".noya", workId),
    agentDir: resolve(agentDir),
  };
}

export function taskLayout(work: WorkLayout, taskId: string): TaskLayout {
  const taskDir = join(work.workDir, "tasks", taskId);
  return {
    work,
    taskId,
    taskDir,
    artifactsDir: join(taskDir, "artifacts"),
    agentsDir: join(taskDir, "agents"),
    registryFile: join(taskDir, "registry.json"),
    sessionDir: join(work.runtimeDir, "sessions", taskId),
  };
}

export async function createWork(worksRoot: string, agentDir: string): Promise<WorkLayout> {
  await mkdir(resolve(worksRoot), { recursive: true });
  const work = workLayout(worksRoot, newDomainId("w"), agentDir);
  await mkdir(work.workDir, { recursive: true });
  await mkdir(work.runtimeDir, { recursive: true });
  await writeInitialCanon(work.workDir);
  await mkdir(join(work.workDir, "canon", "chapters"), { recursive: true });
  await mkdir(join(work.workDir, "canon", "characters"), { recursive: true });
  await mkdir(join(work.workDir, "canon", "library"), { recursive: true });
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(work.workDir, ".gitignore"), "tasks/\n", "utf8");
  git(work.workDir, ["init", "-b", "main"]);
  git(work.workDir, ["config", "user.name", "Noya"]);
  git(work.workDir, ["config", "user.email", "noya@localhost"]);
  git(work.workDir, ["add", "-A", "--", "canon", ".gitignore"]);
  git(work.workDir, ["commit", "-m", `init ${work.workId}`]);
  return work;
}

export function resolveWork(worksRoot: string, agentDir: string, ref: string): WorkLayout {
  const direct = resolve(ref);
  const byId = resolve(worksRoot, ref);
  const found = existsSync(join(direct, "canon", "sync.json"))
    ? direct
    : existsSync(join(byId, "canon", "sync.json"))
      ? byId
      : undefined;
  if (!found) throw new Error(`找不到作品 ${ref}`);
  return { ...workLayout(worksRoot, basename(found), agentDir), workDir: found };
}

export interface RoundRecord {
  startedAt: string;
  endedAt?: string;
  artifacts: string[];
  outcome?: "completed" | "stopped" | "failed" | "retired";
  note?: string;
  /** Author-facing sentence. It is not part of the Subagent prompt. */
  title?: string;
  instruction?: string;
  dispatchCallId?: string;
  continued?: boolean;
}

export type SubagentStatus = "running" | "idle" | "stopped" | "retired" | "terminated" | "failed";

export interface SubagentRecord {
  id: string;
  role: "writer" | "reviewer" | "sync_checker";
  sessionFile: string;
  inputRef: string;
  status: SubagentStatus;
  packageId?: string;
  artifacts: string[];
  rounds: RoundRecord[];
  failureReason?: string;
  workspaceDir: string;
}

export interface FinalizationRecord {
  chapter_id: string;
  draft_id: string;
  at: string;
  event_id?: string;
  chapter_fingerprint?: string;
  chapter_file_identity?: string;
  state?: "prepared" | "saved";
}

export interface TaskRegistry {
  schema_version: 1;
  task_id: string;
  work_id: string;
  context_session_file: string;
  created_at: string;
  creation_request_id?: string;
  subagents: SubagentRecord[];
  finalizations: FinalizationRecord[];
}

export function markInterruptedAgents(registry: TaskRegistry): void {
  for (const agent of registry.subagents) {
    if (agent.status !== "running" && agent.status !== "idle") continue;
    agent.status = "terminated";
    agent.failureReason = "进程退出";
    const round = agent.rounds.at(-1);
    if (round && !round.endedAt) { round.endedAt = new Date().toISOString(); round.outcome = "retired"; round.note = "进程退出"; }
  }
}

export function loadRegistry(task: TaskLayout): TaskRegistry {
  if (lstatSync(task.taskDir).isSymbolicLink()) throw new Error(`任务 ${task.taskId} 的目录无效`);
  const registry = JSON.parse(readFileSync(task.registryFile, "utf8")) as TaskRegistry;
  if (registry.schema_version !== 1 || registry.work_id !== task.work.workId || registry.task_id !== task.taskId ||
      !Number.isFinite(Date.parse(registry.created_at)) || typeof registry.context_session_file !== "string" ||
      !Array.isArray(registry.subagents) || !Array.isArray(registry.finalizations)) throw new Error(`任务 ${task.taskId} 的登记或归属损坏`);
  return registry;
}

export function saveRegistry(task: TaskLayout, registry: TaskRegistry): void {
  mkdirSync(task.taskDir, { recursive: true });
  const temporary = `${task.registryFile}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(registry, null, 2)}\n`);
  renameSync(temporary, task.registryFile);
}

export function createTaskRecord(work: WorkLayout): { task: TaskLayout; registry: TaskRegistry } {
  const task = taskLayout(work, newDomainId("t"));
  mkdirSync(task.artifactsDir, { recursive: true });
  mkdirSync(task.agentsDir, { recursive: true });
  mkdirSync(task.sessionDir, { recursive: true });
  const registry: TaskRegistry = {
    schema_version: 1,
    task_id: task.taskId,
    work_id: work.workId,
    context_session_file: "",
    created_at: new Date().toISOString(),
    subagents: [],
    finalizations: [],
  };
  return { task, registry };
}

export function listTasks(work: WorkLayout): TaskRegistry[] {
  return discoverTasks(work).flatMap(item => item.registry ? [item.registry] : []).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.task_id.localeCompare(b.task_id));
}

/** Keep broken registrations visible without hiding the healthy tasks beside them. */
export function discoverTasks(work: WorkLayout): Array<{ task: TaskLayout; registry?: TaskRegistry; error?: string }> {
  const root = join(work.workDir, "tasks");
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).filter(d => isId(d.name) && (d.isDirectory() || d.isSymbolicLink())).map(d => {
    const task = taskLayout(work, d.name);
    try { return { task, registry: loadRegistry(task) }; }
    catch { return { task, error: `任务 ${d.name} 的登记记录缺失或损坏，请保留文件后修复` }; }
  });
}

export function latestTask(work: WorkLayout): { task: TaskLayout; registry: TaskRegistry } {
  const registries = listTasks(work);
  const registry = registries.at(-1);
  if (!registry) throw new Error(`作品 ${work.workId} 还没有写作任务`);
  return { task: taskLayout(work, registry.task_id), registry };
}

export function isArtifactId(id: string, kind: "package" | "plan" | "draft" | "review" | "proposal" | "check"): boolean {
  return new RegExp(`^${kind}_\\d+$`).test(id);
}

export function nextArtifactNumber(directory: string, prefix: string): number {
  if (!existsSync(directory)) return 1;
  let max = 0;
  for (const name of readdirSync(directory)) {
    const match = new RegExp(`^${prefix}_(\\d+)\\.(?:md|json)$`).exec(name);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

export function readJsonFile<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

export interface PackageArtifact {
  id: string;
  brief: Record<string, unknown>;
  pack: string;
}

export interface DraftMeta {
  draft_id: string;
  writer_id: string;
  package_id: string;
  chapter_id: string;
}

export interface ReviewArtifact {
  review_id: string;
  draft_id: string;
  chapter_id: string;
  review: Record<string, unknown>;
}

export interface ProposalArtifact {
  proposal_id: string;
  chapter_id: string;
  chapter_content_sha256: string;
  finalization_event_id?: string;
  changes: Array<Record<string, unknown>>;
}

export interface CheckArtifact {
  check_id: string;
  proposal_id: string;
  verdicts: Array<Record<string, unknown>>;
}

export function packageFile(task: TaskLayout, id: string): string {
  return join(task.artifactsDir, `${id}.json`);
}

export function loadPackage(task: TaskLayout, id: string): PackageArtifact | undefined {
  if (!isArtifactId(id, "package")) return undefined;
  const file = packageFile(task, id);
  if (!existsSync(file)) return undefined;
  return readJsonFile(file);
}

export function loadDraft(task: TaskLayout, id: string): { meta: DraftMeta; markdown: string } | undefined {
  if (!isArtifactId(id, "draft")) return undefined;
  const metaFile = join(task.artifactsDir, `${id}.json`);
  const bodyFile = join(task.artifactsDir, `${id}.md`);
  if (!existsSync(metaFile) || !existsSync(bodyFile)) return undefined;
  return { meta: readJsonFile(metaFile), markdown: readFileSync(bodyFile, "utf8") };
}

export function loadReview(task: TaskLayout, id: string): ReviewArtifact | undefined {
  if (!isArtifactId(id, "review")) return undefined;
  const file = join(task.artifactsDir, `${id}.json`);
  if (!existsSync(file)) return undefined;
  const parsed = readJsonFile<ReviewArtifact>(file);
  return parsed.review_id ? parsed : undefined;
}

export function listArtifactIds(task: TaskLayout, prefix: string): string[] {
  if (!existsSync(task.artifactsDir)) return [];
  const names = new Set(readdirSync(task.artifactsDir));
  const ids = new Set<string>();
  for (const name of names) {
    const match = new RegExp(`^(${prefix}_\\d+)\\.(md|json)$`).exec(name);
    if (!match?.[1]) continue;
    const id = match[1];
    if (prefix === "draft") {
      if (names.has(`${id}.md`) && names.has(`${id}.json`)) ids.add(id);
    } else if (prefix === "plan") {
      if (match[2] === "md") ids.add(id);
    } else if (match[2] === "json") ids.add(id);
  }
  return [...ids].sort((a, b) => artifactNumber(a) - artifactNumber(b));
}

export function artifactNumber(id: string): number {
  return Number(/_(\d+)$/.exec(id)?.[1] ?? 0);
}
