import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fauxThinking } from "@earendil-works/pi-ai";
import { LocalApp } from "../src/local-app.ts";
import { loadRegistry, taskLayout } from "../src/layout.ts";
import { entriesToProcess } from "../src/process.ts";
import { fauxAssistantMessage, fauxToolCall, openFixture, waitFor } from "./harness.ts";

const brief = { schema_version: 1, id: "b1", chapter_id: "ch1", mode: "write_chapter", intent: "推开木门", requirements: [], constraints: [], ending: null, creative_scope: [], leave_open: [] };
const pack = "## 未知\n来源：无\n人物来历未知。\n";
const sentence = "只写雨夜开门这一句给作者看";
const followUp = "把门槛上的雨水写成冷雨";

function passedReview() {
  return { schema_version: 1, chapter_id: "ch1", checks: { requirements: "passed", character_motivation: "passed", possessions_and_abilities: "passed", ability_rules: "passed" }, feedback: [{ kind: "suggestion", category: "expression", location: { excerpt: "旅人推开木门", description: "开篇" }, reason: "万舟只观察变化", evidence: [], revision_goal: "保持观察，不解释来源" }] };
}

test("任务视图按顺序给出思考、原工具和返回，再次读取身份不变", async () => {
  const fx = await openFixture(); fx.session.dispose();
  const app = new LocalApp({ config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } });
  try {
    const task = (await app.snapshot(fx.work.workId)).task!;
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxThinking("先看作品里有没有雨夜。"), fauxToolCall("read", { path: "canon/world.json" })]),
      fauxAssistantMessage("世界志里还没有雨夜。"),
    ]);
    await app.command({ ...task, kind: "message", text: "看看雨夜能不能写", requestId: randomUUID() });
    await waitFor(() => !app.active, "查阅完成");
    const first = (await app.snapshot(task.workId, task.taskId)).task!;
    const again = (await app.snapshot(task.workId, task.taskId)).task!;
    const visible = first.process.filter(item => item.kind !== "message" || item.role === "assistant" || item.text === "看看雨夜能不能写");
    assert.deepEqual(visible.map(item => item.kind === "tool" ? item.name : item.kind === "thinking" ? "thinking" : item.kind === "message" ? item.text : item.kind), ["看看雨夜能不能写", "thinking", "read", "世界志里还没有雨夜。"]);
    const read = first.process.find(item => item.kind === "tool" && item.name === "read");
    assert.ok(read && read.kind === "tool");
    assert.deepEqual(read.args, { path: "canon/world.json" });
    assert.match(read.result ?? "", /schema_version|world/);
    assert.equal(read.error, false);
    assert.equal(first.process.some(item => item.kind === "message" && item.text.includes("[页面作者]")), false);
    assert.deepEqual(first.process.map(item => item.id), again.process.map(item => item.id));
  } finally { await app.close(); await fx.cleanup(); }
});

test("派发说明不进入写手输入，每张卡片只挂当次成果", async () => {
  const fx = await openFixture(); fx.session.dispose();
  const app = new LocalApp({ config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } });
  try {
    const task = (await app.snapshot(fx.work.workId)).task!;
    fx.faux.writer.setResponses([
      fauxAssistantMessage([fauxToolCall("write", { path: "plan.md", content: "# 方案\n雨夜开门。" })]),
      fauxAssistantMessage([fauxToolCall("submit_plan", {})]),
      fauxAssistantMessage("方案先到这里。"),
      fauxAssistantMessage([fauxToolCall("write", { path: "draft.md", content: "# 雨夜\n\n旅人推开木门，雨水落在门槛上。\n" })]),
      fauxAssistantMessage([fauxToolCall("submit_draft", {})]),
      fauxAssistantMessage("正文好了。"),
    ]);
    fx.faux.reviewer.setResponses([
      fauxAssistantMessage([fauxToolCall("save_review", { review: passedReview() })]),
      fauxAssistantMessage("检查完了。"),
    ]);
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("save_package", { brief, pack })]),
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "writer", package_id: "package_1", task: sentence })]),
      fauxAssistantMessage("正在写方案。"),
      fauxAssistantMessage([fauxToolCall("send_message", { agent_id: "writer-1", message: followUp })]),
      fauxAssistantMessage("正在改正文。"),
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "reviewer", draft_id: "draft_1", task: "检查这一版开篇" })]),
      fauxAssistantMessage("正在检查。"),
      fauxAssistantMessage("第 1 版已通过检查。满意就可以定稿。"),
    ]);
    await app.command({ ...task, kind: "message", text: "写雨夜开门", requestId: randomUUID() });
    await waitFor(() => !app.active, "写作和检查完成");
    const view = (await app.snapshot(task.workId, task.taskId)).task!;
    const writer = loadRegistry(taskLayout(fx.work, task.taskId)).subagents.find(agent => agent.id === "writer-1");
    assert.ok(writer?.sessionFile);
    assert.doesNotMatch(readFileSync(writer.sessionFile, "utf8"), new RegExp(sentence));
    assert.equal(view.process.some(item => item.kind === "tool" && (item.name === "submit_plan" || item.name === "submit_draft" || item.name === "save_review")), false);
    const writerRuns = view.runs.filter(run => run.agentId === "writer-1" && !run.inline && !run.missing);
    assert.equal(writerRuns.length, 2);
    assert.equal(writerRuns[0]!.title, sentence);
    assert.equal(writerRuns[0]!.continued, false);
    assert.deepEqual(writerRuns[0]!.results.map(result => result.artifactId), ["plan_1"]);
    assert.equal(writerRuns[1]!.title, followUp);
    assert.equal(writerRuns[1]!.continued, true);
    assert.deepEqual(writerRuns[1]!.results.map(result => result.artifactId), ["draft_1"]);
    const review = view.runs.find(run => run.agentId === "reviewer-1");
    assert.equal(review?.results[0]?.summary, "通过：万舟只观察变化");
    assert.equal(review?.results[0]?.artifactId.startsWith("review_"), true);
  } finally { await app.close(); await fx.cleanup(); }
});

test("空的或过长的任务说明会被退回，并要求重写", async () => {
  const fx = await openFixture(); fx.session.dispose();
  const app = new LocalApp({ config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } });
  try {
    const task = (await app.snapshot(fx.work.workId)).task!;
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("save_package", { brief, pack })]),
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "writer", package_id: "package_1", task: " " })]),
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "writer", package_id: "package_1", task: "很".repeat(121) })]),
      fauxAssistantMessage("说明需要重写。"),
    ]);
    await app.command({ ...task, kind: "message", text: "写一章", requestId: randomUUID() });
    await waitFor(() => !app.active, "拒绝完成");
    const view = (await app.snapshot(task.workId, task.taskId)).task!;
    const refusals = view.process.filter(item => item.kind === "tool" && item.name === "spawn_subagent").map(item => item.kind === "tool" ? item.result ?? "" : "");
    assert.match(refusals[0] ?? "", /重写/);
    assert.match(refusals[1] ?? "", /缩短|重写/);
    assert.equal(view.runs.some(run => run.agentId === "writer-1" && !run.missing), false);
  } finally { await app.close(); await fx.cleanup(); }
});

test("已回复、未交回和失败都按这一次执行判定", async () => {
  const fx = await openFixture(); fx.session.dispose();
  const app = new LocalApp({ config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } });
  try {
    const task = (await app.snapshot(fx.work.workId)).task!;
    fx.faux.writer.setResponses([fauxAssistantMessage("方案还要再看一眼")]);
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("save_package", { brief, pack })]),
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "writer", package_id: "package_1", task: "先给一句答复" })]),
      fauxAssistantMessage("写手只回了一句。"),
    ]);
    await app.command({ ...task, kind: "message", text: "先问问写手", requestId: randomUUID() });
    await waitFor(() => !app.active, "答复完成");
    let view = (await app.snapshot(task.workId, task.taskId)).task!;
    assert.equal(view.runs.find(run => run.agentId === "writer-1")?.outcome, "replied");
    assert.match(view.runs.find(run => run.agentId === "writer-1")?.lastMessage ?? "", /方案还要再看一眼/);

    fx.faux.writer.setResponses([
      fauxAssistantMessage([fauxThinking("看一眼材料。"), fauxToolCall("read", { path: "input/brief.json" })]),
      fauxAssistantMessage([fauxThinking("没有可交的。")]),
    ]);
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "writer", package_id: "package_1", task: "这次先不交稿" })]),
      fauxAssistantMessage("这一次没有成果。"),
    ]);
    await app.command({ ...task, kind: "message", text: "再试一次但不交稿", requestId: randomUUID() });
    await waitFor(() => !app.active, "空执行完成");
    view = (await app.snapshot(task.workId, task.taskId)).task!;
    assert.equal(view.runs.find(run => run.title === "这次先不交稿")?.outcome, "no-result");

    fx.faux.writer.setResponses([fauxAssistantMessage("调用失败", { stopReason: "error", errorMessage: "模型调用失败\n第二行" })]);
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "writer", package_id: "package_1", task: "这次会失败" })]),
      fauxAssistantMessage("写手失败了。"),
    ]);
    await app.command({ ...task, kind: "message", text: "让它失败", requestId: randomUUID() });
    await waitFor(() => !app.active, "失败完成");
    view = (await app.snapshot(task.workId, task.taskId)).task!;
    const failed = view.runs.find(run => run.title === "这次会失败");
    assert.equal(failed?.outcome, "failed");
    assert.equal(failed?.error, "模型调用失败");
  } finally { await app.close(); await fx.cleanup(); }
});

test("停止后未返回的调用保持停止，重启后未结束的执行变为中断", async () => {
  const fx = await openFixture(); fx.session.dispose();
  const options = { config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } };
  let app = new LocalApp(options);
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    const task = (await app.snapshot(fx.work.workId)).task!;
    fx.faux.writer.setResponses([
      fauxAssistantMessage([fauxToolCall("write", { path: "plan.md", content: "# 方案\n雨夜。" })]),
      fauxAssistantMessage([fauxToolCall("submit_plan", {})]),
      fauxAssistantMessage("方案先交。"),
      async () => { await gate; return fauxAssistantMessage([fauxToolCall("read", { path: "input/brief.json" })]); },
    ]);
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("save_package", { brief, pack })]),
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "writer", package_id: "package_1", task: "先交方案" })]),
      fauxAssistantMessage("方案进行中。"),
      fauxAssistantMessage([fauxToolCall("send_message", { agent_id: "writer-1", message: "继续写正文" })]),
      fauxAssistantMessage("正文进行中。"),
    ]);
    await app.command({ ...task, kind: "message", text: "先写方案再继续", requestId: randomUUID() });
    await waitFor(() => loadRegistry(taskLayout(fx.work, task.taskId)).subagents.some(agent => agent.id === "writer-1" && agent.rounds.length === 2 && agent.status === "running"), "第二轮已开始");
    const stopping = app.command({ ...task, kind: "stop", requestId: randomUUID() });
    release();
    await stopping;
    const stopped = (await app.snapshot(task.workId, task.taskId)).task!;
    assert.equal(stopped.status, "stopped");
    assert.equal(stopped.runs.find(run => run.title === "先交方案")?.outcome, "returned");
    const second = stopped.runs.find(run => run.title === "继续写正文");
    assert.equal(second?.outcome, "stopped");
    assert.equal(second?.items.some(item => item.kind === "tool" && item.state === "running"), false);
    const closing = app.close();
    await closing;
    app = new LocalApp(options);
    const restored = (await app.snapshot(task.workId, task.taskId)).task!;
    assert.equal(restored.runs.find(run => run.title === "先交方案")?.outcome, "returned");
    assert.equal(restored.status, "stopped");
  } finally { release(); await app.close(); await fx.cleanup(); }
});

test("进程退出后未结束的执行变为中断，已经交回的成果还在", async () => {
  const fx = await openFixture(); fx.session.dispose();
  const options = { config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } };
  let app = new LocalApp(options);
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    const task = (await app.snapshot(fx.work.workId)).task!;
    fx.faux.writer.setResponses([
      fauxAssistantMessage([fauxToolCall("write", { path: "plan.md", content: "# 方案\n雨夜。" })]),
      fauxAssistantMessage([fauxToolCall("submit_plan", {})]),
      fauxAssistantMessage("方案先交。"),
      async () => { await gate; return fauxAssistantMessage("正文还没写完"); },
    ]);
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("save_package", { brief, pack })]),
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "writer", package_id: "package_1", task: "先交方案" })]),
      fauxAssistantMessage("方案进行中。"),
      fauxAssistantMessage([fauxToolCall("send_message", { agent_id: "writer-1", message: "继续写正文" })]),
      fauxAssistantMessage("正文进行中。"),
    ]);
    await app.command({ ...task, kind: "message", text: "先写方案再继续", requestId: randomUUID() });
    await waitFor(() => loadRegistry(taskLayout(fx.work, task.taskId)).subagents.some(agent => agent.rounds.length === 2 && agent.status === "running"), "第二轮已开始");
    const closing = app.close();
    release();
    await closing;
    app = new LocalApp(options);
    const restored = (await app.snapshot(task.workId, task.taskId)).task!;
    assert.equal(restored.status, "interrupted");
    assert.equal(restored.runs.find(run => run.title === "先交方案")?.outcome, "returned");
    assert.equal(restored.runs.find(run => run.title === "继续写正文")?.outcome, "interrupted");
  } finally { release(); await app.close(); await fx.cleanup(); }
});

test("另一条任务的视图不含正在执行的任务过程", async () => {
  const fx = await openFixture(); fx.session.dispose();
  const app = new LocalApp({ config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } });
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    const a = (await app.snapshot(fx.work.workId)).task!;
    const b = await app.createTask(a.workId, randomUUID());
    fx.faux.context.setResponses([async () => { await gate; return fauxAssistantMessage("只属于 A 的迟到回复"); }]);
    await app.command({ ...a, kind: "message", text: "A 的雨夜", requestId: randomUUID() });
    const other = (await app.snapshot(b.workId, b.taskId)).task!;
    assert.equal(other.process.some(item => item.kind === "message" && item.text.includes("A 的雨夜")), false);
    assert.equal(other.runs.length, 0);
    release();
    await waitFor(() => !app.active, "A 结束");
  } finally { release(); await app.close(); await fx.cleanup(); }
});

test("会话缺失或单份成果损坏时，其余内容仍在并标出缺失", async () => {
  const fx = await openFixture(); fx.session.dispose();
  const app = new LocalApp({ config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } });
  try {
    const task = (await app.snapshot(fx.work.workId)).task!;
    fx.faux.writer.setResponses([
      fauxAssistantMessage([fauxToolCall("write", { path: "plan.md", content: "# 方案\n雨夜。" })]),
      fauxAssistantMessage([fauxToolCall("submit_plan", {})]),
      fauxAssistantMessage([fauxToolCall("write", { path: "draft.md", content: "# 雨夜\n\n旅人推开木门。\n" })]),
      fauxAssistantMessage([fauxToolCall("submit_draft", {})]),
      fauxAssistantMessage("写好了。"),
    ]);
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("save_package", { brief, pack })]),
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "writer", package_id: "package_1", task: "写下雨夜" })]),
      fauxAssistantMessage("正在写。"),
      fauxAssistantMessage("正文已保存。"),
    ]);
    await app.command({ ...task, kind: "message", text: "写下雨夜", requestId: randomUUID() });
    await waitFor(() => !app.active, "正文完成");
    writeFileSync(join(fx.work.workDir, "tasks", task.taskId, "artifacts", "draft_1.md"), "");
    const damaged = (await app.snapshot(task.workId, task.taskId)).task!;
    const draft = damaged.runs.flatMap(run => run.results).find(result => result.artifactId === "draft_1");
    assert.equal(draft?.readable, false);
    assert.equal(draft?.summary, "暂时无法读取");
    assert.match(damaged.messages.map(message => message.text).join("\n"), /写下雨夜/);
    const registry = loadRegistry(taskLayout(fx.work, task.taskId));
    rmSync(registry.context_session_file);
    const missing = (await app.snapshot(task.workId, task.taskId)).task!;
    assert.match(missing.gap ?? "", /没有保存|无法读取/);
    assert.match(missing.messages.map(message => message.text).join("\n"), /写下雨夜/);
    assert.ok(missing.runs.some(run => run.results.some(result => result.artifactId === "plan_1")));
  } finally { await app.close(); await fx.cleanup(); }
});

test("执行中不能定稿；定稿后各处成果都标为作者已定稿", async () => {
  const fx = await openFixture(); fx.session.dispose();
  const app = new LocalApp({ config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } });
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    const task = (await app.snapshot(fx.work.workId)).task!;
    fx.faux.writer.setResponses([
      fauxAssistantMessage([fauxToolCall("write", { path: "plan.md", content: "# 方案\n雨夜。" })]),
      fauxAssistantMessage([fauxToolCall("submit_plan", {})]),
      fauxAssistantMessage([fauxToolCall("write", { path: "draft.md", content: "# 雨夜\n\n旅人推开木门。\n" })]),
      fauxAssistantMessage([fauxToolCall("submit_draft", {})]),
      fauxAssistantMessage("写好了。"),
    ]);
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("save_package", { brief, pack })]),
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "writer", package_id: "package_1", task: "写下雨夜" })]),
      fauxAssistantMessage("正在写。"),
      fauxAssistantMessage("可以定稿。"),
      async () => { await gate; return fauxAssistantMessage("这轮还没结束"); },
    ]);
    await app.command({ ...task, kind: "message", text: "写下雨夜", requestId: randomUUID() });
    await waitFor(() => !app.active, "可以定稿");
    const ready = (await app.snapshot(task.workId, task.taskId)).task!;
    const draft = ready.drafts.find(item => item.draftId === "draft_1");
    assert.ok(draft);
    fx.faux.context.setResponses([async () => { await gate; return fauxAssistantMessage("定稿后的回复"); }]);
    const running = app.command({ ...task, kind: "message", text: "先别结束", requestId: randomUUID() });
    await assert.rejects(app.command({ ...task, kind: "finalize", draftId: "draft_1", fingerprint: draft.fingerprint, confirmed: true, requestId: randomUUID() }), /正在执行/);
    release();
    await running;
    await waitFor(() => !app.active, "补充结束");
    const fingerprint = (await app.snapshot(task.workId, task.taskId)).task!.drafts.find(item => item.draftId === "draft_1")!.fingerprint;
    fx.faux.context.setResponses([fauxAssistantMessage("正文已定稿。")]);
    await app.command({ ...task, kind: "finalize", draftId: "draft_1", fingerprint, confirmed: true, requestId: randomUUID() });
    await waitFor(() => !app.active, "定稿完成");
    const done = (await app.snapshot(task.workId, task.taskId)).task!;
    assert.equal(done.drafts.find(item => item.draftId === "draft_1")?.finalized, true);
    assert.equal(done.runs.flatMap(run => run.results).find(result => result.artifactId === "draft_1")?.finalized, true);
    assert.ok(done.process.some(item => item.kind === "event" && item.text === "作者已定稿"));
  } finally { release(); await app.close(); await fx.cleanup(); }
});

test("不可读的思考和未知内容保留原样，没有返回的调用不补造结果", () => {
  const items = entriesToProcess([
    { type: "message", id: "a", timestamp: "2026-10-06T00:00:01.000Z", message: { role: "assistant", content: [{ type: "thinking", thinking: "", redacted: true }, { type: "toolCall", id: "call-1", name: "custom_probe", arguments: { topic: "刻痕" } }, { type: "mystery", payload: "原样" }] } },
    { type: "message", id: "u", timestamp: "2026-10-06T00:00:00.000Z", message: { role: "user", content: "[页面作者]\n不要显示" } },
  ], "stopped");
  const again = entriesToProcess([
    { type: "message", id: "a", timestamp: "2026-10-06T00:00:01.000Z", message: { role: "assistant", content: [{ type: "thinking", thinking: "", redacted: true }, { type: "toolCall", id: "call-1", name: "custom_probe", arguments: { topic: "刻痕" } }, { type: "mystery", payload: "原样" }] } },
  ], "stopped");
  assert.equal(items.some(item => item.kind === "message" && item.text.includes("不要显示")), false);
  const thinking = items.find(item => item.kind === "thinking");
  assert.equal(thinking && thinking.kind === "thinking" && thinking.unreadable, true);
  assert.equal(thinking && thinking.kind === "thinking" && thinking.text, undefined);
  const tool = items.find(item => item.kind === "tool");
  assert.ok(tool && tool.kind === "tool");
  assert.equal(tool.name, "custom_probe");
  assert.equal(tool.state, "stopped");
  assert.equal(tool.result, undefined);
  const unknown = items.find(item => item.kind === "unknown");
  assert.equal(unknown && unknown.kind === "unknown" && unknown.type, "mystery");
  assert.match(unknown && unknown.kind === "unknown" ? unknown.raw ?? "" : "", /原样/);
  assert.deepEqual(items.map(item => item.id), again.map(item => item.id));
});
