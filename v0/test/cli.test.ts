import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("noya --continue 没有作品时不会留下空仓库", () => {
  const v0 = fileURLToPath(new URL("..", import.meta.url));
  const root = mkdtempSync(join(tmpdir(), "noya-cli-"));
  const works = join(root, "works");
  mkdirSync(works);
  const config = {
    worksRoot: works,
    roles: {
      context: { provider: "deepseek", model: "deepseek-flash", thinking: "low" },
      writer: { provider: "deepseek", model: "deepseek-flash", thinking: "high" },
      reviewer: { provider: "deepseek", model: "deepseek-v4-pro", thinking: "high" },
      sync_checker: { provider: "deepseek", model: "deepseek-flash", thinking: "low" },
    },
    prompts: {
      context: join(v0, "prompts/sp/context.md"),
      writer: join(v0, "prompts/sp/writer.md"),
      reviewer: join(v0, "prompts/sp/reviewer.md"),
      sync_checker: join(v0, "prompts/sp/sync_checker.md"),
    },
    skillsDir: join(v0, "prompts/skills"),
  };
  const configFile = join(root, "noya.config.json");
  writeFileSync(configFile, JSON.stringify(config));
  const result = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", join(v0, "src/cli.ts"), "--continue"], {
    cwd: v0,
    env: { ...process.env, NOYA_CONFIG: configFile },
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /用法：noya <作品> --continue/);
  assert.equal(readdirSync(works).length, 0);
});
