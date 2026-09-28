import { briefStrings, type PackSection } from "./pack.ts";
import { checkSchema, validators } from "./schema.ts";
import { nonWhitespaceLength, toLf, verbatimIncludes } from "./util.ts";

const GATES = ["requirements", "character_motivation", "possessions_and_abilities", "ability_rules"] as const;

interface Feedback {
  kind?: string;
  category?: string;
  location?: { excerpt?: string | null };
  evidence?: Array<{ source_id?: string; excerpt?: string }>;
}

export function splitDraft(markdown: string): { title: string; content: string } | { error: string } {
  const lines = toLf(markdown).split("\n");
  let index = 0;
  while (index < lines.length && (lines[index] ?? "").trim() === "") index += 1;
  const titleLine = lines[index];
  if (!titleLine?.startsWith("# ")) return { error: "初稿的第一个非空行必须是 # 标题" };
  const title = titleLine.slice(2).trim();
  const content = lines.slice(index + 1).join("\n");
  if (!title) return { error: "初稿标题为空" };
  if (!/\S/.test(content)) return { error: "初稿正文为空" };
  return { title, content };
}

export function reviewProblems(
  review: unknown,
  draft: string,
  brief: Record<string, unknown>,
  sections: PackSection[],
): string[] {
  const schemaErrors = checkSchema(validators.review, review, "检查结果");
  if (schemaErrors.length > 0) return schemaErrors;
  const record = review as { chapter_id?: string; checks?: Record<string, string>; feedback?: Feedback[] };
  const errors: string[] = [];
  if (record.chapter_id !== brief.chapter_id) {
    errors.push(`chapter_id 必须是 ${String(brief.chapter_id)}`);
  }
  const feedback = record.feedback ?? [];
  for (const gate of GATES) {
    const items = feedback.filter((item) => item.category === gate);
    const violations = items.filter((item) => item.kind === "violation");
    const unverified = items.filter((item) => item.kind === "needs_verification");
    const expected = violations.length > 0 ? "failed" : unverified.length > 0 ? "needs_verification" : "passed";
    if (record.checks?.[gate] !== expected) errors.push(`${gate} 的结论应为 ${expected}`);
  }
  for (const item of feedback) {
    if (item.kind === "suggestion" && item.category !== "expression") errors.push("编辑建议的 category 必须是 expression");
    if (item.kind !== "suggestion" && item.category === "expression") errors.push("expression 只用于编辑建议");
    const excerpt = item.location?.excerpt;
    if (excerpt !== null && excerpt !== undefined) {
      if (nonWhitespaceLength(excerpt) < 4) errors.push("正文摘录至少要有 4 个非空白字符");
      if (!verbatimIncludes(draft, excerpt)) errors.push("正文摘录没有出现在被检查的初稿中");
    }
    for (const evidence of item.evidence ?? []) {
      const quote = evidence.excerpt ?? "";
      if (nonWhitespaceLength(quote) < 4) errors.push("依据摘录至少要有 4 个非空白字符");
      if (evidence.source_id === brief.id) {
        if (!briefStrings(brief).some((value) => verbatimIncludes(value, quote))) errors.push("依据摘录没有出现在 Brief 中");
      } else {
        const hits = sections.filter((section) => section.sourceIds.includes(String(evidence.source_id)));
        if (hits.length === 0) errors.push(`依据来源 ${String(evidence.source_id)} 不在 Context Pack 的来源中`);
        else if (!hits.some((section) => verbatimIncludes(section.body, quote))) {
          errors.push("依据摘录没有出现在对应的 Context Pack 段落中");
        }
      }
    }
  }
  return errors;
}
