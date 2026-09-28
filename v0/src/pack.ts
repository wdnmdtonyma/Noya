import { formalIds, type CanonState } from "./canon.ts";
import { isId, toLf } from "./util.ts";

export interface PackSection {
  heading: string;
  body: string;
  sourceIds: string[];
  unknown: boolean;
}

export function parsePack(pack: string, state: CanonState, briefId: string): { sections: PackSection[]; errors: string[] } {
  const text = toLf(pack);
  const lines = text.split("\n");
  const errors: string[] = [];
  let fence = false;
  const chunks: string[][] = [];
  const prelude: string[] = [];
  for (const line of lines) {
    if (line.startsWith("```")) {
      fence = !fence;
      (chunks.at(-1) ?? prelude).push(line);
      continue;
    }
    if (!fence && line.startsWith("## ")) {
      chunks.push([line]);
      continue;
    }
    (chunks.at(-1) ?? prelude).push(line);
  }
  if (prelude.some((line) => line.trim() !== "")) errors.push("Context Pack 在第一个段落之前有内容");
  const known = formalIds(state);
  const sections: PackSection[] = [];
  chunks.forEach((chunk, index) => {
    const heading = chunk[0] ?? "";
    const sourceLines = chunk.filter((line) => /^来源[：:]\s*(.+)$/.test(line));
    const label = `第 ${index + 1} 段`;
    if (sourceLines.length !== 1) {
      errors.push(`${label}需要恰好一行来源，实际有 ${sourceLines.length} 行`);
      return;
    }
    const raw = /^来源[：:]\s*(.+)$/.exec(sourceLines[0] ?? "")?.[1]?.trim() ?? "";
    const tokens = raw.split(/[、,，\s]+/).filter(Boolean);
    const unknown = tokens.length === 1 && tokens[0] === "无";
    if (tokens.includes("无") && !unknown) {
      errors.push(`${label}的「无」不能和其他来源 ID 写在一起`);
      sections.push({ heading, body: chunk.filter((line) => line !== sourceLines[0]).join("\n"), sourceIds: [], unknown: false });
      return;
    }
    const sourceIds: string[] = [];
    if (!unknown) {
      for (const token of tokens) {
        if (token === briefId) errors.push(`${label}的来源 ${token} 是 Brief ID，不能作为资料来源`);
        else if (!isId(token) || !known.has(token)) errors.push(`${label}的来源 ${token} 不是已有正式资料`);
        else sourceIds.push(token);
      }
    }
    const body = chunk.filter((line) => line !== sourceLines[0]).join("\n");
    sections.push({ heading, body, sourceIds, unknown });
  });
  return { sections, errors };
}

export function briefStrings(value: unknown, found: string[] = []): string[] {
  if (typeof value === "string") found.push(value);
  else if (Array.isArray(value)) for (const item of value) briefStrings(item, found);
  else if (value && typeof value === "object") for (const item of Object.values(value)) briefStrings(item, found);
  return found;
}
