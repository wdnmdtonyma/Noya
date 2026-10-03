process.env.PI_OFFLINE = "1";
process.env.PI_SKIP_VERSION_CHECK = "1";

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  fauxAssistantMessage,
  fauxProvider,
  type FauxProviderHandle,
  fauxToolCall,
  getSupportedThinkingLevels,
} from "@earendil-works/pi-ai";
import type { AgentSession, AgentSessionRuntime, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { openWritingSession } from "../src/app.ts";
import { ROLES, loadConfig, type NoyaConfig, type RoleName } from "../src/config.ts";
import type { TaskHub } from "../src/hub.ts";
import { createWork, type WorkLayout } from "../src/layout.ts";
import { createModelRuntime, resolveRoleModels, type RoleBinding } from "../src/models.ts";
import { liveMessages, messageText } from "../src/transcript.ts";

export { fauxAssistantMessage, fauxToolCall };

export interface Fixture {
  root: string;
  work: WorkLayout;
  config: NoyaConfig;
  faux: Record<RoleName, FauxProviderHandle>;
  session: AgentSession;
  hub: TaskHub;
  runtimeHost: AgentSessionRuntime;
  runtime: ModelRuntime;
  cleanup: () => Promise<void>;
}

export async function openFixture(options?: { provider?: "openai"; random?: () => number; beforeOpen?: (work: WorkLayout) => Promise<void> }): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "noya-"));
  const worksRoot = join(root, "works");
  const agentDir = join(root, "pi-agent");
  const prompts = fileURLToPath(new URL("../prompts/", import.meta.url));
  const configFile = join(root, "noya.config.json");
  await writeFile(
    configFile,
    JSON.stringify({
      worksRoot,
      roles: {
        context: { provider: "deepseek", model: "deepseek-flash", thinking: "low" },
        writer: { provider: "deepseek", model: "deepseek-flash", thinking: "high" },
        reviewer: { provider: "deepseek", model: "deepseek-v4-pro", thinking: "high" },
        sync_checker: { provider: "deepseek", model: "deepseek-flash", thinking: "low" },
      },
      prompts: {
        context: join(prompts, "sp", "context.md"),
        writer: join(prompts, "sp", "writer.md"),
        reviewer: join(prompts, "sp", "reviewer.md"),
        sync_checker: join(prompts, "sp", "sync_checker.md"),
      },
      skillsDir: join(prompts, "skills"),
    }),
  );
  const config = loadConfig(configFile);
  if (options?.provider === "openai") {
    for (const role of ROLES) config.roles[role] = { provider: "openai", model: "gpt-6.1-sol", thinking: "low" };
  }
  const resolved = options?.provider === "openai" ? await resolveRoleModels(config, agentDir) : undefined;
  const runtime = resolved?.runtime ?? await createModelRuntime(agentDir);
  const faux = {} as Record<RoleName, FauxProviderHandle>;
  for (const role of ROLES) {
    faux[role] = fauxProvider({
      provider: `noya-${role}`,
      models: [{ id: "scripted", reasoning: true, contextWindow: 32000, maxTokens: 2048 }],
    });
    if (!resolved) runtime.registerNativeProvider(faux[role].provider);
  }
  await runtime.refresh({ allowNetwork: false });
  const models = resolved?.models ?? {} as Record<RoleName, RoleBinding>;
  for (const role of resolved ? [] : ROLES) {
    const model = runtime.getModel(`noya-${role}`, "scripted");
    if (!model) throw new Error(`faux model missing for ${role}`);
    if (!getSupportedThinkingLevels(model).includes("low")) throw new Error(`${role} does not support low`);
    models[role] = { model, thinking: "low" };
  }
  const work = await createWork(worksRoot, agentDir);
  await options?.beforeOpen?.(work);
  const opened = await openWritingSession({
    work,
    config,
    runtime,
    models,
    ...(options?.random ? { random: options.random } : {}),
  });
  return {
    root,
    work,
    config,
    faux,
    runtime,
    session: opened.runtimeHost.session,
    hub: opened.hub,
    runtimeHost: opened.runtimeHost,
    cleanup: async () => {
      opened.runtimeHost.session.dispose();
      await rm(root, { recursive: true, force: true });
    },
  };
}

export function transcript(session: AgentSession): string {
  return liveMessages(session)
    .map((message) => `${message.role ?? "?"} ${messageText(message)}`)
    .join("\n");
}

export function toolTexts(session: AgentSession, name?: string): string[] {
  return liveMessages(session)
    .filter((message) => message.role === "toolResult" && (name === undefined || message.toolName === name))
    .map((message) => messageText(message));
}

export async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > 8000) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
