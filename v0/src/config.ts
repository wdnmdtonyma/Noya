import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROLES = ["context", "writer", "reviewer", "sync_checker"] as const;
export type RoleName = (typeof ROLES)[number];

export interface RoleConfig {
  provider: "deepseek";
  model: string;
  thinking: string;
  contextWindow?: number;
  maxOutput?: number;
  thinkingLevels?: string[];
}

export interface NoyaConfig {
  file: string;
  worksRoot: string;
  roles: Record<RoleName, RoleConfig>;
  prompts: Record<RoleName, string>;
  skillsDir: string;
}

const DEFAULT_CONFIG = fileURLToPath(new URL("../noya.config.json", import.meta.url));

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 必须是对象`);
  }
  return value as Record<string, unknown>;
}

function requiredString(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} 缺少 ${key}`);
  return value;
}

function roleConfig(value: unknown, role: RoleName): RoleConfig {
  const record = asRecord(value, `角色 ${role}`);
  const provider = requiredString(record, "provider", role);
  if (provider !== "deepseek") throw new Error(`${role} 的 provider 必须是 deepseek`);
  const thinkingLevels = record.thinkingLevels;
  if (thinkingLevels !== undefined && (!Array.isArray(thinkingLevels) || thinkingLevels.some((item) => typeof item !== "string"))) {
    throw new Error(`${role} 的 thinkingLevels 必须是字符串数组`);
  }
  return {
    provider: "deepseek",
    model: requiredString(record, "model", role),
    thinking: requiredString(record, "thinking", role),
    ...(typeof record.contextWindow === "number" ? { contextWindow: record.contextWindow } : {}),
    ...(typeof record.maxOutput === "number" ? { maxOutput: record.maxOutput } : {}),
    ...(thinkingLevels ? { thinkingLevels: thinkingLevels as string[] } : {}),
  };
}

export function configPath(): string {
  return process.env.NOYA_CONFIG ? resolve(process.env.NOYA_CONFIG) : DEFAULT_CONFIG;
}

export function loadConfig(file = configPath()): NoyaConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`无法读取配置 ${file}：${message}`);
  }
  const record = asRecord(parsed, "配置");
  const base = resolve(file, "..");
  const absolute = (value: string) => (isAbsolute(value) ? value : resolve(base, value));
  const roles = asRecord(record.roles, "roles");
  const prompts = asRecord(record.prompts, "prompts");
  const resolvedRoles = {} as Record<RoleName, RoleConfig>;
  const resolvedPrompts = {} as Record<RoleName, string>;
  for (const role of ROLES) {
    resolvedRoles[role] = roleConfig(roles[role], role);
    resolvedPrompts[role] = absolute(requiredString(prompts, role, "prompts"));
  }
  return {
    file,
    worksRoot: absolute(requiredString(record, "worksRoot", "配置")),
    roles: resolvedRoles,
    prompts: resolvedPrompts,
    skillsDir: absolute(requiredString(record, "skillsDir", "配置")),
  };
}
