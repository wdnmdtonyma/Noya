import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getSupportedThinkingLevels, type Model, type ThinkingLevel } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { type NoyaConfig, type RoleName, ROLES } from "./config.ts";
import { useChatGPTSubscription } from "./subscription.ts";

export interface RoleBinding {
  model: Model<any>;
  thinking: ThinkingLevel;
}

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

export async function createModelRuntime(agentDir: string): Promise<ModelRuntime> {
  mkdirSync(agentDir, { recursive: true });
  const runtime = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"),
    modelsPath: join(agentDir, "models.json"),
    refreshOnCreate: false,
  });
  useChatGPTSubscription(runtime);
  return runtime;
}

export async function resolveRoleModels(
  config: NoyaConfig,
  agentDir: string,
): Promise<{ runtime: ModelRuntime; models: Record<RoleName, RoleBinding> }> {
  const runtime = await createModelRuntime(agentDir);
  await runtime.refresh({ allowNetwork: false });
  for (const role of ROLES) {
    const spec = config.roles[role];
    if (runtime.getModel(spec.provider, spec.model)) continue;
    if (spec.contextWindow === undefined || spec.maxOutput === undefined || !spec.thinkingLevels?.length) {
      throw new Error(`${role} 的模型 ${spec.model} 不在内置列表中，必须同时给出上下文窗口、最大输出和支持的 thinking 档位`);
    }
    const thinkingLevelMap: Record<string, string | null> = {};
    for (const level of THINKING_LEVELS) thinkingLevelMap[level] = null;
    for (const level of spec.thinkingLevels) thinkingLevelMap[level] = level;
    writeCustomModel(agentDir, spec.provider, {
      id: spec.model,
      name: spec.model,
      reasoning: spec.thinkingLevels.some((level) => level !== "off"),
      input: ["text"],
      contextWindow: spec.contextWindow,
      maxTokens: spec.maxOutput,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      thinkingLevelMap,
    });
  }
  await runtime.refresh({ allowNetwork: false });
  const models = {} as Record<RoleName, RoleBinding>;
  for (const role of ROLES) {
    const spec = config.roles[role];
    const model = runtime.getModel(spec.provider, spec.model);
    if (!model) throw new Error(`找不到模型 ${spec.provider}/${spec.model}`);
    const supported = getSupportedThinkingLevels(model);
    if (!supported.includes(spec.thinking as ThinkingLevel)) {
      throw new Error(`${role} 的 thinking「${spec.thinking}」不是 ${spec.model} 支持的档位（${supported.join("、")}），不会自动改成别的档位`);
    }
    models[role] = { model, thinking: spec.thinking as ThinkingLevel };
  }
  return { runtime, models };
}

function writeCustomModel(agentDir: string, providerId: string, model: Record<string, unknown>): void {
  const modelsPath = join(agentDir, "models.json");
  const current = existsSync(modelsPath)
    ? (JSON.parse(readFileSync(modelsPath, "utf8")) as { providers?: Record<string, { models?: unknown[] }> })
    : {};
  const providers = current.providers ?? {};
  const provider = providers[providerId] ?? {};
  const models = Array.isArray(provider.models) ? [...provider.models] : [];
  const index = models.findIndex((item) => !!item && typeof item === "object" && (item as { id?: string }).id === model.id);
  if (index >= 0) models[index] = model;
  else models.push(model);
  providers[providerId] = { ...provider, models };
  writeFileSync(modelsPath, `${JSON.stringify({ ...current, providers }, null, 2)}\n`);
}
