import { readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const findParameters = Type.Object({
  pattern: Type.String({ description: "Glob pattern, for example *.md or **/*.json" }),
  path: Type.Optional(Type.String({ description: "Directory to search. Defaults to the working directory." })),
  limit: Type.Optional(Type.Number({ description: "Maximum number of matches. Defaults to 1000." })),
});

function globToRegExp(pattern: string): RegExp {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    if (char === "*" && next === "*") {
      if (pattern[index + 2] === "/") {
        source += "(?:.*/)?";
        index += 2;
      } else {
        source += ".*";
        index += 1;
      }
      continue;
    }
    if (char === "*") {
      source += "[^/]*";
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      continue;
    }
    source += /[.+^${}()|[\]\\]/.test(char ?? "") ? `\\${char}` : char;
  }
  return new RegExp(`${source}$`);
}

async function walk(directory: string, root: string, matches: string[], pattern: RegExp, limit: number): Promise<void> {
  if (matches.length >= limit) return;
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (matches.length >= limit) return;
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const absolute = join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      await walk(absolute, root, matches, pattern, limit);
      continue;
    }
    if (!entry.isFile()) continue;
    const rel = relative(root, absolute).split("\\").join("/");
    if (pattern.test(rel)) matches.push(rel);
  }
}

export function registerFindTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "find",
    label: "find",
    description: "Find files by glob pattern using the local filesystem. Does not download tools.",
    promptSnippet: "Find files by glob pattern",
    parameters: findParameters,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const root = resolve(ctx.cwd, params.path ?? ".");
      const limit = params.limit && params.limit > 0 ? Math.floor(params.limit) : 1000;
      const matches: string[] = [];
      await walk(root, root, matches, globToRegExp(params.pattern), limit);
      matches.sort();
      const text = matches.length > 0 ? matches.join("\n") : "No matches found.";
      return { content: [{ type: "text", text }], details: { count: matches.length } };
    },
  });
}
