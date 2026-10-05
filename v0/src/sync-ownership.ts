import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadCanon, cloneCanon, saveCanon, commitCanon, type CanonState } from "./canon.ts";
import { discoverTasks, loadDraft, loadRegistry, saveRegistry, taskLayout, type TaskLayout, type TaskRegistry, type WorkLayout } from "./layout.ts";
import { pageRecord } from "./local-records.ts";
import { splitDraft } from "./review.ts";
import { contentHash, isId, refuse, withWriteLock } from "./util.ts";

export interface SyncOwner {
  taskId: string; eventId: string; chapterFingerprint: string; at: string; draftId?: string;
}
interface OwnershipFile { schema_version: 1; chapters: Record<string, SyncOwner> }
export interface ChapterOwnership { version: string; owner?: SyncOwner; error?: string; needsRepair?: boolean }

export function chapterFingerprint(chapter: { title: string; content: string }): string {
  return contentHash(JSON.stringify([chapter.title, chapter.content]));
}
function readOwners(work: WorkLayout): OwnershipFile {
  const file = join(work.runtimeDir, "sync-owners.json");
  if (!existsSync(file)) return { schema_version: 1, chapters: {} };
  const saved = JSON.parse(readFileSync(file, "utf8")) as OwnershipFile;
  if (saved.schema_version !== 1 || !saved.chapters || typeof saved.chapters !== "object") throw new Error("同步归属记录损坏");
  for (const [chapter, owner] of Object.entries(saved.chapters)) {
    if (!isId(chapter) || !owner || !isId(owner.taskId) || !owner.eventId || !owner.chapterFingerprint || !owner.at) throw new Error("同步归属记录损坏");
  }
  return saved;
}
function saveOwner(work: WorkLayout, chapterId: string, owner: SyncOwner): void {
  const data = readOwners(work); data.chapters[chapterId] = owner;
  mkdirSync(work.runtimeDir, { recursive: true });
  const file = join(work.runtimeDir, "sync-owners.json");
  const temporary = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(data, null, 2)); renameSync(temporary, file);
}

/** The durable author acceptance precedes canon writes, allowing ownership repair after a crash. */
export function registerFinalization(task: TaskLayout, registry: TaskRegistry, chapterId: string, draftId: string, chapter: { title: string; content: string }, preparedFile: string): SyncOwner {
  // Validate existing metadata before accepting a new write.
  readOwners(task.work);
  const previous = discoverTasks(task.work).flatMap(t => t.registry?.finalizations ?? []).map(f => Date.parse(f.at)).filter(Number.isFinite);
  const at = new Date(Math.max(Date.now(), ...previous.map(t => t + 1))).toISOString();
  const owner = { taskId: task.taskId, eventId: randomUUID(), chapterFingerprint: chapterFingerprint(chapter), at, draftId };
  registry.finalizations.push({ chapter_id: chapterId, draft_id: draftId, at, event_id: owner.eventId, chapter_fingerprint: owner.chapterFingerprint, chapter_file_identity: fileIdentity(preparedFile), state: "prepared" });
  saveRegistry(task, registry);
  return owner;
}
export function completeFinalization(work: WorkLayout, chapterId: string, owner: SyncOwner): void {
  saveOwner(work, chapterId, owner);
  const task = taskLayout(work, owner.taskId), registry = loadRegistry(task);
  const record = registry.finalizations.find(f => f.event_id === owner.eventId);
  if (record) { record.state = "saved"; saveRegistry(task, registry); }
}
function fileIdentity(file: string): string {
  const stat = statSync(file, { bigint: true }); return `${stat.dev}:${stat.ino}`;
}
function installed(work: WorkLayout, chapterId: string, identity: string): boolean {
  const file = join(work.workDir, "canon", "chapters", `${chapterId}.json`);
  return existsSync(file) && fileIdentity(file) === identity;
}

/** Finish a committed chapter replacement if shutdown interrupted its pending marker or owner save. */
export async function repairFinalizations(work: WorkLayout): Promise<void> {
  await withWriteLock(async () => {
    for (const { registry } of discoverTasks(work)) {
      if (!registry) continue;
      for (const record of registry.finalizations) {
        if (record.state !== "prepared" || !record.chapter_file_identity || !installed(work, record.chapter_id, record.chapter_file_identity)) continue;
        const state = chapterOwnership(work, record.chapter_id);
        if (state.error || !state.owner || state.owner.eventId !== record.event_id) continue;
        const before = loadCanon(work.workDir), after = cloneCanon(before);
        if (!after.sync.pending_chapter_ids.includes(record.chapter_id)) after.sync.pending_chapter_ids.push(record.chapter_id);
        await saveCanon(work.workDir, before, after);
        commitCanon(work.workDir, [join(work.workDir, "canon", "chapters", `${record.chapter_id}.json`), join(work.workDir, "canon", "sync.json")], `recover finalize ${record.chapter_id} (${state.owner.taskId} / ${record.draft_id})`);
        completeFinalization(work, record.chapter_id, state.owner);
        // Keep this loaded registry consistent if more than one record needs repair.
        record.state = "saved";
      }
    }
  });
}

export interface WorkReadState { canon: CanonState; ownership: Map<string, ChapterOwnership> }
/** Share immutable disk reads within a single page snapshot, never across writes. */
export function readWorkState(work: WorkLayout): WorkReadState {
  const canon = loadCanon(work.workDir);
  const tasks = discoverTasks(work);
  let owners: OwnershipFile | undefined, error: string | undefined;
  try { owners = readOwners(work); } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
  return { canon, ownership: new Map([...canon.chapters.keys()].map(id => [id, resolveOwnership(work, id, canon, tasks, owners, error)])) };
}
export function chapterOwnership(work: WorkLayout, chapterId: string): ChapterOwnership {
  return readWorkState(work).ownership.get(chapterId) ?? { version: "", error: `章节 ${chapterId} 不存在` };
}

/** Read-only reconciliation. A broken or ambiguous record is never an unowned chapter. */
function resolveOwnership(work: WorkLayout, chapterId: string, canon: CanonState, tasks: ReturnType<typeof discoverTasks>, owners?: OwnershipFile, ownershipError?: string): ChapterOwnership {
  let version = "";
  try {
    const chapter = canon.chapters.get(chapterId);
    if (!chapter) throw new Error(`章节 ${chapterId} 不存在`);
    const fingerprint = chapterFingerprint(chapter); version = `legacy:${fingerprint}`;
    if (ownershipError) throw new Error(ownershipError);
    const saved = owners?.chapters[chapterId];
    const records = tasks.flatMap(item => (item.registry?.finalizations ?? []).filter(f => f.chapter_id === chapterId && (f.state !== "prepared" || !!f.chapter_file_identity && installed(work, chapterId, f.chapter_file_identity))).map(f => ({ task: item.task, record: f })));
    records.sort((a, b) => b.record.at.localeCompare(a.record.at));
    const latest = records[0];
    if (saved && (!latest || saved.at >= latest.record.at)) {
      if (saved.chapterFingerprint !== fingerprint) throw new Error("当前正文与同步归属不一致，请保留记录后修复");
      const task = taskLayout(work, saved.taskId); loadRegistry(task); pageRecord(task);
      return { owner: saved, version: saved.eventId, needsRepair: latest?.record.state === "prepared" };
    }
    if (tasks.some(t => t.error)) throw new Error("存在损坏任务，无法可靠确定同步归属；请先修复记录");
    if (!latest) {
      for (const item of tasks) pageRecord(item.task);
      return { version };
    }
    if (records[1]?.record.at === latest.record.at) throw new Error("多条定稿记录时间相同，无法确定同步归属");
    pageRecord(latest.task);
    const draft = loadDraft(latest.task, latest.record.draft_id);
    if (!draft) throw new Error("定稿记录对应的稿件缺失，无法确定同步归属");
    const split = splitDraft(draft.markdown);
    if ("error" in split || chapterFingerprint(split) !== fingerprint || (latest.record.chapter_fingerprint && latest.record.chapter_fingerprint !== fingerprint)) throw new Error("定稿登记与当前正文不一致，不能自动承接同步");
    const owner = { taskId: latest.task.taskId, draftId: latest.record.draft_id, eventId: latest.record.event_id ?? `legacy:${latest.task.taskId}:${latest.record.draft_id}:${latest.record.at}`, chapterFingerprint: fingerprint, at: latest.record.at };
    return { owner, version: owner.eventId, needsRepair: latest.record.state === "prepared" };
  } catch (error) { return { version, error: error instanceof Error ? error.message : String(error) }; }
}

export function requireSyncOwner(task: TaskLayout, chapterId: string, expectedVersion?: string): SyncOwner {
  const state = chapterOwnership(task.work, chapterId);
  if (state.error) refuse(state.error);
  if (!state.owner) refuse(`章节 ${chapterId} 尚未关联同步任务，请由作者在页面明确承接同步`);
  if (state.owner.taskId !== task.taskId) refuse(`章节 ${chapterId} 由任务 ${state.owner.taskId} 负责同步。请返回同步任务 ${state.owner.taskId}，不能接管它的停止或待决定状态。`);
  if (expectedVersion && state.version !== expectedVersion) refuse("本章已重新定稿，旧同步清单已过期，请依据当前正式版本重新整理");
  return state.owner;
}

export async function claimSync(task: TaskLayout, chapterId: string, expectedVersion: string): Promise<void> {
  await withWriteLock(async () => {
    const canon = loadCanon(task.work.workDir);
    if (!canon.sync.pending_chapter_ids.includes(chapterId)) refuse("章节已经不需要同步，请刷新");
    const state = chapterOwnership(task.work, chapterId);
    if (state.error) refuse(state.error);
    if (state.owner) refuse(`章节已由任务 ${state.owner.taskId} 负责同步，请返回该任务`);
    if (state.version !== expectedVersion) refuse("章节正式版本已变化，请重新确认承接对象");
    saveOwner(task.work, chapterId, { taskId: task.taskId, eventId: randomUUID(), chapterFingerprint: chapterFingerprint(canon.chapters.get(chapterId)!), at: new Date().toISOString() });
  });
}
