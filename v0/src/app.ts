import { createAgentSessionRuntime, type AgentSessionRuntime, type ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";
import type { NoyaConfig, RoleName } from "./config.ts";
import { TaskHub } from "./hub.ts";
import { createTaskRecord, latestTask, loadRegistry, markInterruptedAgents, saveRegistry, taskLayout, type WorkLayout } from "./layout.ts";
import { isId } from "./util.ts";
import type { RoleBinding } from "./models.ts";
import { createRoleSession } from "./session.ts";

export async function openWritingSession(options: {
  work: WorkLayout;
  config: NoyaConfig;
  runtime: ModelRuntime;
  models: Record<RoleName, RoleBinding>;
  resume?: boolean;
  taskId?: string;
  random?: () => number;
}): Promise<{ hub: TaskHub; runtimeHost: AgentSessionRuntime }> {
  if (options.taskId && !isId(options.taskId)) throw new Error("任务标识无效");
  const task = options.taskId ? taskLayout(options.work, options.taskId) : undefined;
  const existing = task ? { task, registry: loadRegistry(task) } : options.resume ? latestTask(options.work) : undefined;
  if (existing) {
    markInterruptedAgents(existing.registry);
    saveRegistry(existing.task, existing.registry);
  }
  const opened = existing ?? createTaskRecord(options.work);
  if (!existing) saveRegistry(opened.task, opened.registry);
  const hub = new TaskHub(
    options.work,
    opened.task,
    opened.registry,
    options.config,
    options.runtime,
    options.models,
    options.random,
  );
  const sessionManager = existing?.registry.context_session_file
    ? SessionManager.open(existing.registry.context_session_file, opened.task.sessionDir, options.work.workDir)
    : SessionManager.create(options.work.workDir, opened.task.sessionDir);
  const runtimeHost = await createAgentSessionRuntime(
    async ({ cwd, agentDir, sessionManager: manager }) => {
      const created = await createRoleSession({
        role: "context",
        cwd,
        agentDir,
        modelRuntime: options.runtime,
        model: options.models.context.model,
        thinking: options.models.context.thinking,
        sessionManager: manager,
        taskId: hub.taskId,
        workDir: options.work.workDir,
        skillsDir: options.config.skillsDir,
        promptFile: options.config.prompts.context,
      });
      hub.attachContext(created.session);
      return { ...created, diagnostics: created.services.diagnostics };
    },
    {
      cwd: options.work.workDir,
      agentDir: options.work.agentDir,
      sessionManager,
    },
  );
  return { hub, runtimeHost };
}
