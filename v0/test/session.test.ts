import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { openWritingSession } from "../src/app.ts";
import { SWITCH_HINT } from "../src/extension.ts";
import { latestTask } from "../src/layout.ts";
import { liveMessages, messageText } from "../src/transcript.ts";
import { fauxAssistantMessage, fauxToolCall, openFixture, transcript, type Fixture } from "./harness.ts";

let fx: Fixture;

describe("会话工厂", { concurrency: false }, () => {
before(async () => {
  fx = await openFixture({
    beforeOpen: async (work) => {
      writeFileSync(join(work.workDir, "AGENTS.md"), "PROJECT_AGENTS_SENTINEL 不应进入提示词\n");
      writeFileSync(join(work.agentDir, "AGENTS.md"), "GLOBAL_AGENTS_SENTINEL 不应进入提示词\n");
      writeFileSync(join(work.agentDir, "SYSTEM.md"), "AGENT_DIR_SYSTEM_SENTINEL 不应进入提示词\n");
    },
  });
});

after(async () => {
  await fx.cleanup();
});

test("Context 系统提示词只含 Noya 的提示词、Skill 清单和工作目录说明", () => {
  const prompt = fx.session.systemPrompt;
  assert.match(prompt, /你是 Noya 中唯一与作者对话的助手/);
  assert.match(prompt, /write-chapter/);
  assert.match(prompt, /context-sync/);
  assert.match(prompt, /answer/);
  assert.match(prompt, new RegExp(fx.work.workDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(prompt, /expert coding assistant/);
  assert.doesNotMatch(prompt, /PROJECT_AGENTS_SENTINEL/);
  assert.doesNotMatch(prompt, /GLOBAL_AGENTS_SENTINEL/);
  assert.doesNotMatch(prompt, /AGENT_DIR_SYSTEM_SENTINEL/);
});

test("Context 的工具是规格里的名单，没有 bash 和 write", () => {
  const names = [...fx.session.getActiveToolNames()].sort();
  assert.deepEqual(names, [
    "apply_sync",
    "ask_author",
    "edit",
    "find",
    "get_subagents",
    "grep",
    "ls",
    "query_canon",
    "read",
    "save_package",
    "save_revision",
    "save_sync_proposal",
    "send_message",
    "spawn_subagent",
    "stop_subagent",
    "write_canon",
  ]);
});

test("find 用本地文件系统匹配文件，不需要下载", async () => {
  writeFileSync(join(fx.work.workDir, "visible.md"), "hello\n");
  fx.faux.context.setResponses([
    fauxAssistantMessage([fauxToolCall("find", { pattern: "*.md", path: "." })]),
    fauxAssistantMessage("找到了"),
  ]);
  await fx.session.prompt("找一下 markdown");
  const text = transcript(fx.session);
  assert.match(text, /visible\.md/);
  assert.doesNotMatch(text, /\[拒绝\]/);
});

test("新作品只有一次初始提交，作者是 Noya，任务区不进 git", () => {
  const log = execFileSync("git", ["-C", fx.work.workDir, "log", "--format=%an %ae %s"], { encoding: "utf8" }).trim();
  assert.equal(log.split("\n").length, 1);
  assert.match(log, /^Noya noya@localhost init /);
  const ignored = execFileSync("git", ["-C", fx.work.workDir, "check-ignore", "tasks/example"], { encoding: "utf8" }).trim();
  assert.equal(ignored, "tasks/example");
});

test("新写作任务不带上一个任务的对话，继续任务打开登记里的 Context 会话", async () => {
  fx.faux.context.setResponses([fauxAssistantMessage("收到第一句")]);
  await fx.session.prompt("UNIQUE_AUTHOR_LINE");
  const registered = latestTask(fx.work).registry.context_session_file;
  assert.equal(fx.session.sessionFile, registered);
  SessionManager.create(fx.work.workDir, join(fx.work.runtimeDir, "sessions", fx.hub.taskId));
  const resumed = await openWritingSession({
    work: fx.work,
    config: fx.config,
    runtime: fx.runtime,
    models: fx.hub.models,
    resume: true,
  });
  assert.equal(resumed.runtimeHost.session.sessionFile, registered);
  assert.match(transcript(resumed.runtimeHost.session), /UNIQUE_AUTHOR_LINE/);
  resumed.runtimeHost.session.dispose();
  const fresh = await openWritingSession({
    work: fx.work,
    config: fx.config,
    runtime: fx.runtime,
    models: fx.hub.models,
  });
  assert.equal(liveMessages(fresh.runtimeHost.session).some((message) => messageText(message).includes("UNIQUE_AUTHOR_LINE")), false);
  fresh.runtimeHost.session.dispose();
});

test("切换或分叉会话会被取消，并提示改用 noya 命令", async () => {
  const switched = await fx.runtimeHost.newSession();
  assert.equal(switched.cancelled, true);
  const forked = await fx.runtimeHost.fork("missing");
  assert.equal(forked.cancelled, true);
  const leaf = fx.session.sessionManager.getLeafId();
  const other = fx.session.sessionManager.getEntries().find((entry) => entry.id !== leaf);
  assert.ok(other);
  const tree = await fx.session.navigateTree(other.id);
  assert.equal(tree.cancelled, true);
  assert.match(transcript(fx.session), new RegExp(SWITCH_HINT));
});
});
