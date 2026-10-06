import { existsSync } from "node:fs";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import type { ProcessItem } from "./local-contract.ts";
import type { TaskLayout, TaskRegistry } from "./layout.ts";
import type { PageRecord } from "./local-records.ts";
import { messageText } from "./transcript.ts";

export interface LiveCall {
  id: string;
  name: string;
  args: unknown;
  output?: string;
  at: number;
  agentId: string;
}

interface LooseEntry {
  type?: string;
  id?: string;
  timestamp?: string;
  display?: boolean;
  customType?: string;
  content?: unknown;
  message?: { role?: string; content?: unknown; toolCallId?: string; toolName?: string; isError?: boolean };
}

export function partialText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "content" in value) return messageText(value as { content?: unknown });
  if (value == null) return "";
  try { return JSON.stringify(value); } catch { return String(value); }
}

function stamp(entry: LooseEntry): number {
  const at = Date.parse(entry.timestamp ?? "");
  return Number.isFinite(at) ? at : 0;
}

function parts(content: unknown): Array<Record<string, unknown>> {
  if (typeof content === "string") return [{ type: "text", text: content }];
  if (!Array.isArray(content)) return [];
  return content.filter((part): part is Record<string, unknown> => !!part && typeof part === "object");
}

function pagePrompt(text: string): boolean {
  return text.trimStart().startsWith("[页面作者]");
}

/** Normalize one saved session branch. Ids come from the session entry or tool call. */
export function entriesToProcess(entries: LooseEntry[], unresolved: "running" | "stopped" | "interrupted" = "running"): ProcessItem[] {
  const items: ProcessItem[] = [];
  const tools = new Map<string, Extract<ProcessItem, { kind: "tool" }>>();
  for (const entry of entries) {
    const at = stamp(entry);
    const id = entry.id || `entry:${items.length}`;
    if (entry.type === "custom_message") {
      if (entry.display === false || String(entry.customType ?? "").startsWith("noya.")) continue;
      const text = messageText({ content: entry.content });
      if (!text || pagePrompt(text)) continue;
      items.push({ kind: "message", id, role: "assistant", text, at });
      continue;
    }
    if (entry.type !== "message" || !entry.message) continue;
    const message = entry.message;
    if (message.role === "toolResult") {
      const callId = message.toolCallId || "";
      const tool = callId ? tools.get(callId) : undefined;
      const text = messageText(message);
      if (!tool) {
        items.push({ kind: "unknown", id, type: "toolResult", raw: text, at });
        continue;
      }
      tool.result = text;
      tool.error = message.isError === true;
      tool.state = message.isError === true ? "error" : "done";
      continue;
    }
    if (message.role === "system") continue;
    if (message.role !== "assistant" && message.role !== "user") {
      items.push({ kind: "unknown", id, type: message.role || "message", raw: messageText(message), at });
      continue;
    }
    if (message.role === "user") {
      const text = messageText(message);
      if (!text || pagePrompt(text)) continue;
      items.push({ kind: "message", id, role: "user", text, at });
      continue;
    }
    parts(message.content).forEach((part, index) => {
      const partId = `${id}:${index}`;
      const type = typeof part.type === "string" ? part.type : "unknown";
      if (type === "text") {
        const text = typeof part.text === "string" ? part.text : "";
        if (text && !pagePrompt(text)) items.push({ kind: "message", id: partId, role: "assistant", text, at });
        return;
      }
      if (type === "thinking") {
        if (part.redacted === true || typeof part.thinking !== "string" || !part.thinking.trim()) items.push({ kind: "thinking", id: partId, unreadable: true, at });
        else items.push({ kind: "thinking", id: partId, text: part.thinking, at });
        return;
      }
      if (type === "toolCall") {
        const callId = typeof part.id === "string" && part.id ? part.id : partId;
        const tool: Extract<ProcessItem, { kind: "tool" }> = {
          kind: "tool", id: callId, name: typeof part.name === "string" ? part.name : "unknown_tool", args: part.arguments ?? {}, state: "running", at,
        };
        tools.set(callId, tool);
        items.push(tool);
        return;
      }
      items.push({ kind: "unknown", id: partId, type, raw: JSON.stringify(part), at });
    });
  }
  if (unresolved === "running") return items;
  return items.map(item => item.kind === "tool" && item.state === "running" ? { ...item, state: unresolved } : item);
}

export function applyLive(items: ProcessItem[], calls: LiveCall[], text?: { id: string; text: string; at: number }): ProcessItem[] {
  const next = items.map(item => item.kind === "tool" ? { ...item } : item);
  const tools = new Map(next.filter((item): item is Extract<ProcessItem, { kind: "tool" }> => item.kind === "tool").map(item => [item.id, item]));
  for (const call of calls) {
    const found = tools.get(call.id);
    if (found) {
      if (found.state === "running" && call.output) found.output = call.output;
      continue;
    }
    const tool: Extract<ProcessItem, { kind: "tool" }> = { kind: "tool", id: call.id, name: call.name, args: call.args, output: call.output, state: "running", at: call.at };
    tools.set(call.id, tool);
    next.push(tool);
  }
  if (text?.text) {
    const saved = [...next].reverse().find((item): item is Extract<ProcessItem, { kind: "message" }> => item.kind === "message" && item.role === "assistant");
    if (!saved || saved.text !== text.text) next.push({ kind: "message", id: text.id, role: "assistant", text: text.text, at: text.at });
  }
  return next.sort((a, b) => a.at - b.at);
}

export function readSessionProcess(file: string, sessionDir: string, cwd: string, unresolved: "running" | "stopped" | "interrupted"): { items: ProcessItem[]; gap?: string } {
  if (!file || !existsSync(file)) return { items: [], gap: file ? "对话过程没有保存。已有的消息和成果仍在。" : undefined };
  try {
    const manager = SessionManager.open(file, sessionDir, cwd);
    return { items: entriesToProcess(manager.getBranch() as LooseEntry[], unresolved) };
  } catch {
    return { items: [], gap: "对话过程无法读取。已有的消息和成果仍在。" };
  }
}

export function readContextProcess(task: TaskLayout, registry: TaskRegistry, page: PageRecord, calls: LiveCall[] = [], streaming?: string): { items: ProcessItem[]; gap?: string } {
  const unresolved = page.status === "stopped" ? "stopped" : page.status === "interrupted" ? "interrupted" : "running";
  const saved = registry.context_session_file ? readSessionProcess(registry.context_session_file, task.sessionDir, task.work.workDir, unresolved) : { items: [] as ProcessItem[] };
  const items = [...saved.items];
  for (const message of page.messages) {
    if (message.role !== "user") continue;
    items.push({ kind: "message", id: message.id, role: "user", text: message.text, at: message.at });
  }
  for (const record of registry.finalizations) {
    const at = Date.parse(record.at);
    items.push({ kind: "event", id: `finalize:${record.event_id ?? record.draft_id}`, event: "finalized", text: "作者已定稿", at: Number.isFinite(at) ? at : 0 });
  }
  for (const mark of page.marks ?? []) items.push({ kind: "event", id: mark.id, event: mark.event, text: mark.text, at: mark.at });
  if (page.status === "stopped" && !(page.marks ?? []).some(mark => mark.event === "stopped")) {
    const at = page.stoppedAt ? Date.parse(page.stoppedAt) : items.reduce((max, item) => Math.max(max, item.at), Date.parse(registry.created_at) || 0);
    items.push({ kind: "event", id: `stopped:${task.taskId}`, event: "stopped", text: "已停止", at });
  }
  if (saved.gap) items.push({ kind: "event", id: `gap:${task.taskId}`, event: "missing", text: saved.gap, at: Date.parse(registry.created_at) || 0 });
  const liveText = streaming ? { id: "live:context", text: streaming, at: Date.now() } : undefined;
  return { items: applyLive(items, calls.filter(call => call.agentId === "context"), liveText), gap: saved.gap };
}
