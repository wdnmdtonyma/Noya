import { existsSync, readdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SubagentRecord, TaskLayout, WorkLayout } from "./layout.ts";

const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;

export function resolveToolPath(input: string, cwd: string): string {
  let normalized = input.replace(UNICODE_SPACES, " ");
  if (normalized.startsWith("@")) normalized = normalized.slice(1);
  if (normalized === "~") normalized = homedir();
  else if (normalized.startsWith("~/")) normalized = join(homedir(), normalized.slice(2));
  if (normalized.startsWith("file://")) normalized = fileURLToPath(normalized);
  const absolute = isAbsolute(normalized) ? resolve(normalized) : resolve(cwd, normalized);
  let cursor = absolute;
  const missing: string[] = [];
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) break;
    missing.push(cursor.slice(parent.length + 1));
    cursor = parent;
  }
  let real = existsSync(cursor) ? realpathSync(cursor) : cursor;
  for (const part of missing.reverse()) real = join(real, part);
  return real;
}

export function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export interface GuardZones {
  allow: string[];
  forbid: string[];
  exact?: string[];
}

export function guardDecision(target: string, zones: GuardZones): string | undefined {
  const realTarget = target;
  if (zones.forbid.some((zone) => isInside(zone, realTarget))) return "目标在禁止访问的目录中";
  if (zones.forbid.some((zone) => isInside(realTarget, zone) && realTarget !== zone)) return "搜索范围会进入禁止访问的目录";
  if (zones.exact) {
    if (!zones.exact.includes(realTarget)) return "这个文件不在允许修改的范围内";
    return undefined;
  }
  if (!zones.allow.some((zone) => isInside(zone, realTarget))) return "目标不在允许访问的目录中";
  return undefined;
}

export function forbiddenZones(work: WorkLayout): string[] {
  const zones = [resolve(work.worksRoot, ".noya")];
  if (existsSync(work.worksRoot)) {
    for (const name of readdirSync(work.worksRoot)) {
      if (name === ".noya" || name === work.workId) continue;
      const sibling = join(work.worksRoot, name);
      if (existsSync(sibling)) zones.push(sibling);
    }
  }
  return zones.map((zone) => (existsSync(zone) ? realpathSync(zone) : zone));
}

export function contextReadZones(work: WorkLayout, skillsDir: string, task?: TaskLayout): GuardZones {
  return {
    allow: [realpathSync(join(work.workDir, "canon")), ...(task ? [realpathSync(task.taskDir)] : []), realpathSync(skillsDir)],
    forbid: forbiddenZones(work),
  };
}

export function contextEditZones(files: string[], work: WorkLayout): GuardZones {
  return { allow: [], forbid: forbiddenZones(work), exact: files };
}

export function directoryZones(directory: string, work: WorkLayout): GuardZones {
  return {
    allow: [existsSync(directory) ? realpathSync(directory) : directory],
    forbid: forbiddenZones(work),
  };
}

export function writerEditFiles(agent: SubagentRecord | undefined): string[] {
  if (!agent || agent.role !== "writer" || agent.status === "running") return [];
  if (agent.status !== "idle" && agent.status !== "stopped") return [];
  return [resolve(agent.workspaceDir, "plan.md"), resolve(agent.workspaceDir, "draft.md")];
}

export function pathArgument(toolName: string, input: Record<string, unknown>): string | undefined {
  if (!["read", "edit", "write", "grep", "find", "ls"].includes(toolName)) return undefined;
  const value = input.path;
  if (typeof value === "string" && value.length > 0) return value;
  if (toolName === "grep" || toolName === "find" || toolName === "ls") return ".";
  return undefined;
}
