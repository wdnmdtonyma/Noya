/** Same-origin browser contract. No credentials or filesystem paths cross this boundary. */
export type RunStatus = "idle" | "running" | "stopping" | "stopped" | "interrupted" | "failed";
export interface WorkSummary { workId: string; name: string; error?: string }
export interface TaskRef { workId: string; taskId: string }
export interface MessageView { id: string; role: "user" | "assistant" | "notice"; text: string; at: number; draftId?: string }
export interface DraftView {
  draftId: string; chapterId: string; title: string; version: number; characters: number;
  review: "pending" | "passed" | "issues"; reviewText: string; finalized: boolean;
  replaces: boolean; fingerprint: string;
}
export interface DecisionView { id: string; title: string; detail: string; options: string[] }
export interface TaskView extends TaskRef {
  status: RunStatus; error?: string; messages: MessageView[]; drafts: DraftView[];
  agents: Array<{ id: string; role: string; status: string; detail: string }>;
  pendingChapters: string[]; decision?: DecisionView; streaming?: string; activity?: string;
}
export interface AppSnapshot {
  works: WorkSummary[]; task: TaskView | null; active: TaskRef | null; configurationError?: string;
}
export type PageCommand = TaskRef & { requestId: string } & (
  { kind: "message"; text: string; draftId?: string } |
  { kind: "decide"; decisionId: string; answer: string } |
  { kind: "finalize"; draftId: string; fingerprint: string; confirmed: true } |
  { kind: "continue" } | { kind: "stop" }
);
