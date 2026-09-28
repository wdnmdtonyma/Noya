import { execFileSync } from "node:child_process";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function isId(value: string): boolean {
  return ID_PATTERN.test(value);
}

export function refusal(...reasons: string[]): string {
  const lines = reasons.flatMap((reason) => reason.split("\n")).map((reason) => reason.trim()).filter(Boolean);
  if (lines.length === 0) return "[拒绝]";
  if (lines.length === 1) return `[拒绝] ${lines[0]}`;
  return `[拒绝]\n${lines.map((line) => `- ${line}`).join("\n")}`;
}

export function refuse(...reasons: string[]): never {
  throw new Error(refusal(...reasons));
}

export function isRefusal(text: string): boolean {
  return text.startsWith("[拒绝]");
}

export function toLf(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

export function verbatimIncludes(haystack: string, needle: string): boolean {
  const pin = toLf(needle).trim();
  if (!pin) return false;
  return toLf(haystack).includes(pin);
}

export function nonWhitespaceLength(text: string): number {
  return text.replace(/\s/g, "").length;
}

export function isPunctuationOnly(text: string): boolean {
  return /^[\p{P}]+$/u.test(text);
}

let writeChain: Promise<void> = Promise.resolve();

export function withWriteLock<T>(action: () => Promise<T>): Promise<T> {
  const run = writeChain.then(action, action);
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function atomicWrite(file: string, content: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, file);
}

export function writeJson(file: string, value: unknown): Promise<void> {
  return atomicWrite(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export function commandExists(command: string): boolean {
  try {
    execFileSync(command, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
