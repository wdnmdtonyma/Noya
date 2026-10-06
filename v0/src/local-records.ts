import { readWorkState, type WorkReadState } from "./sync-ownership.ts";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { listArtifactIds, loadDraft, loadPackage, loadReview, type TaskLayout, type TaskRegistry } from "./layout.ts";
import { splitDraft } from "./review.ts";
import { messageText } from "./transcript.ts";
import { contentHash } from "./util.ts";
import type { DecisionView, DraftView, MessageView, RunStatus } from "./local-contract.ts";

export interface PageRecord {
  status: RunStatus;
  sessionSaved?: boolean;
  stoppedByAuthor?: boolean;
  stoppedAt?: string;
  error?: string;
  marks?: Array<{ id: string; event: "stopped" | "failed" | "interrupted"; text: string; at: number }>;
  requests: Array<{ id: string; signature: string }>;
  messages: MessageView[];
  decision?: DecisionView & { kind: "canon" | "sync" | "direction"; args: Record<string, unknown>; fingerprint: string };
  approved?: { kind: "canon" | "sync"; fingerprint: string };
}

export function pageRecord(task: TaskLayout): PageRecord {
  const file = join(task.taskDir, "page.json");
  if (!existsSync(file)) return { status: "idle", requests: [], messages: [] };
  try {
    const value = JSON.parse(readFileSync(file, "utf8")) as PageRecord;
    if (!Array.isArray(value.requests) || !Array.isArray(value.messages) || !value.status) throw new Error();
    return value;
  } catch { throw new Error(`任务 ${task.taskId} 的页面记录损坏，请保留记录后修复`); }
}

export function savePageRecord(task: TaskLayout, record: PageRecord): void {
  mkdirSync(task.taskDir, { recursive: true });
  const file = join(task.taskDir, "page.json");
  writeFileSync(`${file}.tmp`, JSON.stringify(record, null, 2));
  renameSync(`${file}.tmp`, file);
}

export function readMessages(task: TaskLayout, registry: TaskRegistry, page: PageRecord): MessageView[] {
  const messages = [...page.messages];
  for (const id of listArtifactIds(task, "draft")) {
    messages.push({ id: `artifact-${id}`, role: "notice", text: "已保存正文", draftId: id, at: statSync(join(task.artifactsDir, `${id}.json`)).mtimeMs });
  }
  if (!registry.context_session_file || !existsSync(registry.context_session_file)) return messages.sort((a, b) => a.at - b.at);
  let manager;
  try { manager = SessionManager.open(registry.context_session_file, task.sessionDir, task.work.workDir); }
  catch { return messages.sort((a, b) => a.at - b.at); }
  for (const entry of manager.getBranch()) {
    if (entry.type !== "message") continue;
    const m = entry.message;
    if (m.role !== "assistant" && m.role !== "user") continue;
    const text = messageText(m);
    if (!text || text.startsWith("[页面作者]")) continue;
    messages.push({ id: entry.id, role: m.role, text, at: Date.parse(entry.timestamp) });
  }
  return messages.sort((a, b) => a.at - b.at);
}

export function readDrafts(task: TaskLayout, registry: TaskRegistry, workState: WorkReadState = readWorkState(task.work)): DraftView[] {
  const reviews = listArtifactIds(task, "review").map(id => loadReview(task, id)).filter(r => !!r);
  const versions = new Map<string, number>();
  return listArtifactIds(task, "draft").flatMap(id => {
    try { return [draftView(task, registry, id, versions, reviews, workState)]; }
    catch { return [{ draftId: id, chapterId: "", title: id, version: 0, characters: 0, review: "pending" as const, reviewText: "暂时无法读取", finalized: false, superseded: false, replaces: false, fingerprint: "" }]; }
  });
}

function draftView(task: TaskLayout, registry: TaskRegistry, id: string, versions: Map<string, number>, reviews: Array<NonNullable<ReturnType<typeof loadReview>>>, workState: WorkReadState): DraftView {
    const { canon, ownership: chapterOwners } = workState;
    const draft = loadDraft(task, id)!;
    if (draft.meta.draft_id !== id || !loadPackage(task, draft.meta.package_id)) throw new Error(`稿件 ${id} 的身份或写作材料不完整`);
    const split = splitDraft(draft.markdown);
    if ("error" in split) throw new Error(`稿件 ${id} 不完整：${split.error}`);
    const version = (versions.get(draft.meta.chapter_id) ?? 0) + 1;
    versions.set(draft.meta.chapter_id, version);
    const review = reviews.filter(r => r.draft_id === id).at(-1);
    const passed = review && Object.values(review.review.checks as Record<string, string>).every(v => v === "passed");
    const conflicts = review && Object.values(review.review.checks as Record<string, string>).some(v => v === "failed");
    const feedback = (review?.review.feedback ?? []) as Array<{ kind: string; problem?: string; suggestion?: string; reason?: string }>;
    const last = registry.finalizations.filter(f => f.chapter_id === draft.meta.chapter_id).at(-1);
    const chapter = canon.chapters.get(draft.meta.chapter_id);
    const ownership = chapterOwners.get(draft.meta.chapter_id);
    return {
      draftId: id, chapterId: draft.meta.chapter_id, title: split.title, version,
      characters: [...split.content.replace(/\s/g, "")].length,
      review: review ? passed ? "passed" : conflicts ? "issues" : "verification" : "pending",
      reviewText: review ? `${passed ? "四项内容检查通过" : conflicts ? "本版检查记录发现内容冲突。" : "本版检查记录包含核实项；Context Agent 的核实结果见本版交稿说明。"}${feedback.length ? `\n${feedback.map(f => `${f.kind === "suggestion" ? "编辑建议" : f.kind === "needs_verification" ? "核实记录" : "内容冲突"}：${f.problem || f.reason || f.suggestion || "见交稿说明"}`).join("\n")}` : ""}` : "正文已保存，尚未完成检查。",
      finalized: !ownership?.error && ownership?.owner?.taskId === task.taskId && ownership.owner.draftId === id && chapter?.content === split.content,
      superseded: !!ownership?.owner && registry.finalizations.some(f => f.draft_id === id) && (ownership.owner.taskId !== task.taskId || ownership.owner.draftId !== id),
      replaces: !!chapter,
      fingerprint: contentHash(JSON.stringify({ id, body: draft.markdown, chapter: chapter ?? null, finalization: last ?? null, version: ownership?.version, ownershipError: ownership?.error })),
    };
}
