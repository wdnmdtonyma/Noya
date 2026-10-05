import { readFileSync } from "node:fs";
import {
  type AgentSession,
  type AgentSessionServices,
  createAgentSessionFromServices,
  createAgentSessionServices,
  type ModelRuntime,
  type SessionManager,
} from "@earendil-works/pi-coding-agent";
import type { Model, ThinkingLevel } from "@earendil-works/pi-ai";
import type { RoleName } from "./config.ts";
import { createNoyaExtension } from "./extension.ts";

export const ROLE_TOOLS: Record<RoleName, string[]> = {
  context: [
    "read",
    "grep",
    "find",
    "ls",
    "edit",
    "query_canon",
    "ask_author",
    "write_canon",
    "save_package",
    "save_revision",
    "save_sync_proposal",
    "apply_sync",
    "spawn_subagent",
    "send_message",
    "stop_subagent",
    "get_subagents",
  ],
  writer: ["submit_plan", "submit_draft", "read", "grep", "write", "edit"],
  reviewer: ["save_review", "read", "grep"],
  sync_checker: ["save_sync_check", "query_canon", "read", "grep"],
};

/** Record an actual author action without starting a model turn (e.g. explicit finalization). */
export function recordAuthorMessage(session: AgentSession, text: string, timestamp = Date.now()): void {
  const message = { role: "user" as const, content: text, timestamp };
  session.sessionManager.appendMessage(message);
  session.agent.state.messages = [...session.messages, message];
}

export async function createRoleSession(options: {
  role: RoleName;
  cwd: string;
  agentDir: string;
  modelRuntime: ModelRuntime;
  model: Model<any>;
  thinking: ThinkingLevel;
  sessionManager: SessionManager;
  taskId: string;
  workDir: string;
  agentId?: string;
  skillsDir: string;
  promptFile: string;
}): Promise<{ session: AgentSession; services: AgentSessionServices; extensionsResult: Awaited<ReturnType<typeof createAgentSessionFromServices>>["extensionsResult"]; modelFallbackMessage?: string }> {
  const services = await createAgentSessionServices({
    cwd: options.cwd,
    agentDir: options.agentDir,
    modelRuntime: options.modelRuntime,
    resourceLoaderOptions: {
      extensionFactories: [createNoyaExtension(options.taskId, options.role, options.workDir, options.agentId)],
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPrompt: readFileSync(options.promptFile, "utf8"),
      appendSystemPrompt: [],
      additionalSkillPaths: options.role === "context" ? [options.skillsDir] : [],
    },
  });
  const created = await createAgentSessionFromServices({
    services,
    sessionManager: options.sessionManager,
    model: options.model,
    thinkingLevel: options.thinking,
    tools: ROLE_TOOLS[options.role],
  });
  created.session.setAutoCompactionEnabled(false);
  created.session.setAutoRetryEnabled(false);
  return { ...created, services };
}
