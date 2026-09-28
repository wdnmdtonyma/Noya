import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { isPunctuationOnly, isRefusal, toLf, verbatimIncludes } from "./util.ts";

interface LooseMessage {
  role?: string;
  content?: unknown;
  toolName?: string;
  isError?: boolean;
  stopReason?: string;
  errorMessage?: string;
}

export function messageText(message: { content?: unknown } | undefined): string {
  const content = message?.content;
  if (typeof content === "string") return toLf(content);
  if (!Array.isArray(content)) return "";
  return toLf(
    content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const record = part as { type?: string; text?: string };
        return record.type === "text" && typeof record.text === "string" ? record.text : "";
      })
      .join(""),
  );
}

export function liveMessages(session: AgentSession): LooseMessage[] {
  const agent = session.agent as { state?: { messages?: LooseMessage[] } };
  return agent.state?.messages ?? [];
}

export function authorConfirmationProblem(session: AgentSession, confirmation: string | undefined): string | undefined {
  const trimmed = toLf(confirmation ?? "").trim();
  if (!trimmed) return "作者确认为空";
  if (isPunctuationOnly(trimmed)) return "作者确认不能只有标点";
  const messages = liveMessages(session);
  let lastUser = -1;
  let lastWrite = -1;
  messages.forEach((message, index) => {
    if (message.role === "user") lastUser = index;
    if (
      message.role === "toolResult" &&
      message.isError !== true &&
      (message.toolName === "write_canon" || message.toolName === "apply_sync") &&
      !isRefusal(messageText(message))
    ) {
      lastWrite = index;
    }
  });
  if (lastUser < 0) return "还没有作者消息";
  if (lastWrite >= 0 && lastUser < lastWrite) return "最近一条作者消息早于上次写入";
  if (!verbatimIncludes(messageText(messages[lastUser]), trimmed)) return "作者确认没有出现在最近一条作者消息中";
  return undefined;
}

export function assistantFailure(session: AgentSession | undefined): string | undefined {
  if (!session) return undefined;
  const assistant = [...liveMessages(session)].reverse().find((message) => message.role === "assistant");
  if (!assistant) return undefined;
  if (assistant.stopReason === "error" || assistant.errorMessage) return assistant.errorMessage || "模型调用失败";
  return undefined;
}
