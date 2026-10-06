/** Same-origin browser contract. No credentials or filesystem paths cross this boundary. */
export type RunStatus = "idle" | "running" | "stopping" | "stopped" | "interrupted" | "failed";
export interface WorkSummary { workId: string; name: string; error?: string }
export interface TaskRef { workId: string; taskId: string }
export interface TaskSummary extends TaskRef { name: string; createdAt: string; status: RunStatus; needsDecision: boolean; error?: string }
export interface PendingSyncView { chapterId: string; title: string; version: string; owner?: TaskRef; ownerName?: string; error?: string }
export interface MessageView { id: string; role: "user" | "assistant" | "notice"; text: string; at: number; draftId?: string }
export interface DraftView {
  draftId: string; chapterId: string; title: string; version: number; characters: number;
  review: "pending" | "passed" | "verification" | "issues"; reviewText: string; finalized: boolean; superseded: boolean;
  replaces: boolean; fingerprint: string;
}
export interface DecisionView { id: string; title: string; detail: string; options: string[] }
export type ProcessItem =
  | { kind: "message"; id: string; role: "user" | "assistant"; text: string; at: number }
  | { kind: "thinking"; id: string; text?: string; unreadable?: boolean; at: number }
  | { kind: "tool"; id: string; name: string; args: unknown; output?: string; result?: string; error?: boolean; state: "running" | "done" | "error" | "stopped" | "interrupted"; at: number }
  | { kind: "event"; id: string; event: string; text: string; at: number }
  | { kind: "unknown"; id: string; type: string; raw?: string; at: number };
export type RunOutcome = "running" | "stopping" | "returned" | "replied" | "no-result" | "failed" | "stopped" | "interrupted";
export interface ResultView {
  artifactId: string; draftId?: string; title: string; summary: string; readable: boolean; finalized?: boolean;
}
export interface SubRunView {
  agentId: string; round: number; dispatchCallId?: string; continued: boolean;
  title?: string; instruction: string; outcome: RunOutcome; startedAt: string; endedAt?: string;
  results: ResultView[]; lastMessage?: string; error?: string; liveAction?: string;
  items: ProcessItem[]; missing?: boolean; inline?: boolean;
  call?: { name: string; args: unknown; result?: string; error?: boolean };
}
export interface TaskView extends TaskRef {
  name: string; createdAt: string;
  status: RunStatus; error?: string; messages: MessageView[]; drafts: DraftView[];
  agents: Array<{ id: string; role: string; status: string; detail: string }>;
  pendingChapters: string[]; pendingSync: PendingSyncView[]; decision?: DecisionView; streaming?: string; activity?: string;
  process: ProcessItem[]; runs: SubRunView[]; gap?: string;
}
export interface AppSnapshot {
  works: WorkSummary[]; tasks: TaskSummary[]; task: TaskView | null; active: TaskRef | null; activeName?: string; selectionError?: string; configurationError?: string;
}
export type PageCommand = TaskRef & { requestId: string } & (
  { kind: "message"; text: string; draftId?: string } |
  { kind: "decide"; decisionId: string; answer: string } |
  { kind: "finalize"; draftId: string; fingerprint: string; confirmed: true } |
  { kind: "claim-sync"; chapterId: string; version: string } |
  { kind: "continue" } | { kind: "stop" }
);
