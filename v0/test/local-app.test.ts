import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadConfig } from "../src/config.ts";
import { LocalApp } from "../src/local-app.ts";
import { startLocalServer } from "../src/local-server.ts";
import { fauxAssistantMessage, fauxToolCall, openFixture, waitFor } from "./harness.ts";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { latestTask } from "../src/layout.ts";

test("本机页面无需登录即可连接，创建作品可重复读取且不创建第二个任务", async () => {
  const root = await mkdtemp(join(tmpdir(), "noya-ui-"));
  const app = new LocalApp({ config: { ...loadConfig(), worksRoot: root } });
  const server = await startLocalServer(app, { port: 0 });
  try {
    const health = await fetch(`${server.url}/api/state`).then(r => r.json());
    assert.deepEqual(health.works, []);
    const created = await fetch(`${server.url}/api/works`, { method: "POST", headers: { "Content-Type": "application/json", Origin: server.url }, body: "{}" }).then(r => r.json());
    const first = await app.snapshot(created.workId);
    const again = await app.snapshot(created.workId);
    assert.equal(first.task?.taskId, again.task?.taskId);
    assert.equal(first.works.length, 1);
    assert.equal(first.task?.messages.length, 0);
    assert.equal(first.active, null);
    const blocked = await fetch(`${server.url}/api/works`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://foreign.example" }, body: "{}" });
    assert.equal(blocked.status, 403);
    await assert.rejects(app.snapshot("../outside"), /作品/);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("真实工具交稿、措辞修改保留旧版，指定旧版定稿后同步，并拒绝过期确认", async () => {
  const fx = await openFixture(); fx.session.dispose();
  let app = new LocalApp({ config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } });
  try {
    const task = (await app.snapshot(fx.work.workId)).task!;
    const command = (action: object) => app.command({ workId: task.workId, taskId: task.taskId, requestId: randomUUID(), ...action } as Parameters<LocalApp["command"]>[0]);
    const brief = { schema_version: 1, id: "brief1", chapter_id: "ch1", mode: "write_chapter", intent: "旅人推开木门", requirements: ["旅人推开木门"], constraints: [], ending: null, creative_scope: ["其余细节自由安排"], leave_open: [] };
    fx.faux.writer.setResponses([
      fauxAssistantMessage([fauxToolCall("write", { path: "plan.md", content: "# 方案\n旅人听见风声，推门进屋。" })]),
      fauxAssistantMessage([fauxToolCall("submit_plan", {})]), fauxAssistantMessage("方案已保存。"),
      fauxAssistantMessage([fauxToolCall("write", { path: "draft.md", content: "# 门前\n\n旅人推开木门，听见屋里有人轻轻叹息。" })]),
      fauxAssistantMessage([fauxToolCall("submit_draft", {})]), fauxAssistantMessage("正文已保存。"),
    ]);
    const review = { schema_version: 1, chapter_id: "ch1", checks: { requirements: "passed", character_motivation: "passed", possessions_and_abilities: "passed", ability_rules: "passed" }, feedback: [] };
    fx.faux.reviewer.setResponses([fauxAssistantMessage([fauxToolCall("save_review", { review })]), fauxAssistantMessage("四项检查通过。")]);
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("save_package", { brief, pack: "## 尚未确定\n来源：无\n人物的来历尚未知。" })]),
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "writer", package_id: "package_1" , task: "完成本次安排"})]), fauxAssistantMessage("正在准备章节方案。"),
      fauxAssistantMessage([fauxToolCall("send_message", { agent_id: "writer-1", message: "方案通过，写正文。" })]), fauxAssistantMessage("正在写正文。"),
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "reviewer", draft_id: "draft_1" , task: "完成本次安排"})]), fauxAssistantMessage("正在检查。"),
      fauxAssistantMessage("初稿已交付，四项检查通过，可以阅读全文。"),
    ]);
    await command({ kind: "message", text: "请写一章旅人推开木门的故事" });
    await waitFor(() => !app.active, "第一版交稿");
    let state = (await app.snapshot(task.workId)).task!;
    assert.equal(state.drafts[0]?.review, "passed");
    assert.equal(state.agents.filter(a => a.role === "writer").length, 1);
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("edit", { path: `tasks/${task.taskId}/revision.md`, edits: [{ oldText: "轻轻叹息", newText: "低声叹息" }] })]),
      fauxAssistantMessage([fauxToolCall("save_revision", {})]),
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "reviewer", draft_id: "draft_2" , task: "完成本次安排"})]), fauxAssistantMessage("措辞已改，正在复查。"),
      fauxAssistantMessage("新稿已交付。"),
    ]);
    fx.faux.reviewer.setResponses([fauxAssistantMessage([fauxToolCall("save_review", { review })]), fauxAssistantMessage("复查通过。")]);
    await command({ kind: "message", text: "把轻轻叹息改成低声叹息，纯措辞修改。", draftId: "draft_1" });
    await waitFor(() => !app.active, "新版本交稿");
    state = (await app.snapshot(task.workId)).task!;
    assert.equal(state.drafts.length, 2);
    assert.equal(state.drafts[1]?.review, "passed");
    assert.match((await app.draft(task, "draft_1")).markdown, /轻轻叹息/);
    const log = readFileSync(latestTask(fx.work).registry.context_session_file, "utf8").split("\n").filter(l => l.includes('"toolName":"edit"')).join("\n");
    assert.match((await app.draft(task, "draft_2")).markdown, /低声叹息/, log);
    await app.close();
    app = new LocalApp({ config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } });
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("edit", { path: `tasks/${task.taskId}/revision.md`, edits: [{ oldText: "轻轻叹息", newText: "轻微叹息" }] })]),
      fauxAssistantMessage([fauxToolCall("save_revision", {})]),
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "reviewer", draft_id: "draft_3" , task: "完成本次安排"})]), fauxAssistantMessage("原写手已结束，我直接修改所读版本的措辞并安排新检查。"), fauxAssistantMessage("第三版交付。"),
    ]);
    fx.faux.reviewer.setResponses([fauxAssistantMessage([fauxToolCall("save_review", { review })]), fauxAssistantMessage("复查通过。")]);
    await command({ kind: "message", text: "针对第一版，把轻轻叹息改成轻微叹息。", draftId: "draft_1" });
    await waitFor(() => !app.active, "重启后修改旧版本");
    state = (await app.snapshot(task.workId)).task!;
    assert.equal(state.drafts.length, 3);
    assert.match((await app.draft(task, "draft_3")).markdown, /轻微叹息/);
    assert.match((await app.draft(task, "draft_2")).markdown, /低声叹息/);
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("ask_author", { question: "改为掌柜认识旅人吗？", detail: "这会改变原有未知的方向。", options: ["确认新方向", "保留原方向"], draft_id: "draft_1" })]),
      fauxAssistantMessage("等待你决定。"),
    ]);
    await command({ kind: "message", text: "先讨论要不要改变掌柜的方向" }); await waitFor(() => !app.active, "等待创作决定");
    const staleDecision = (await app.snapshot(task.workId)).task!.decision!.id;
    fx.faux.context.setResponses([fauxAssistantMessage("同步暂未完成，请稍后继续。")]);
    const finalize = { kind: "finalize", draftId: "draft_1", fingerprint: state.drafts[0]!.fingerprint, confirmed: true };
    await command(finalize);
    await waitFor(() => !app.active, "定稿后本轮结束");
    state = (await app.snapshot(task.workId)).task!;
    assert.equal(state.drafts[0]?.finalized, true);
    assert.deepEqual(state.pendingChapters, ["ch1"]);
    await assert.rejects(command(finalize), /状态已变化/);
    await assert.rejects(command({ kind: "decide", decisionId: staleDecision, answer: "确认新方向" }), /确认已过期/);
    assert.equal((await app.snapshot(task.workId)).task!.decision, undefined);
    await waitFor(() => !app.active, "过期决定释放占用");
    const changes = [{ id: "summary", change: { type: "chapter_meta", chapter_id: "ch1", summary: "旅人推门，听见屋内叹息。", key_characters: [] }, evidence: ["旅人推开木门"], rationale: "这是正文的关键行动" }];
    fx.faux.sync_checker.setResponses([fauxAssistantMessage([fauxToolCall("save_sync_check", { verdicts: [{ change_id: "summary", verdict: "supported", reason: "正文明确写出推门", conflicting_ids: [] }] })]), fauxAssistantMessage("核对通过。")]);
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("save_sync_proposal", { chapter_id: "ch1", changes })]),
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "sync_checker", proposal_id: "proposal_1" , task: "完成本次安排"})]), fauxAssistantMessage("继续核对。"),
      fauxAssistantMessage([fauxToolCall("apply_sync", { proposal_id: "proposal_1", change_ids: ["summary"] })]), fauxAssistantMessage("资料已同步。"),
    ]);
    await command({ kind: "continue" }); await waitFor(() => !app.active, "资料同步结束");
    state = (await app.snapshot(task.workId)).task!;
    assert.deepEqual(state.pendingChapters, []);
    assert.equal(state.drafts[0]?.finalized, true);
  } finally { await app.close(); await fx.cleanup(); }
});

test("页面作者消息经过真实会话；同服务竞争、重复发送和整体停止有明确结果", async () => {
  const fx = await openFixture();
  fx.session.dispose();
  const app = new LocalApp({ config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } });
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    const a = (await app.snapshot(fx.work.workId)).task!;
    const bId = (await app.create()).workId;
    const b = (await app.snapshot(bId)).task!;
    fx.faux.context.setResponses([async () => { await gate; return fauxAssistantMessage("先讨论，不开始写作。"); }]);
    const command = { kind: "message" as const, workId: a.workId, taskId: a.taskId, requestId: randomUUID(), text: "聊一聊想法" };
    await Promise.all([app.command(command), app.command(command)]);
    await assert.rejects(app.command({ ...command, requestId: randomUUID(), workId: b.workId, taskId: b.taskId }), /正在执行/);
    assert.equal((await app.snapshot(bId)).active?.workId, a.workId);
    const stopping = Promise.all([app.command({ ...command, kind: "stop", requestId: randomUUID() }), app.command({ ...command, kind: "stop", requestId: randomUUID() })]);
    release();
    await stopping;
    const stopped = (await app.snapshot(a.workId)).task!;
    assert.equal(stopped.status, "stopped");
    assert.equal(stopped.messages.filter(m => m.role === "user").length, 1);
    assert.equal(stopped.drafts.length, 0);
    fx.faux.context.setResponses([fauxAssistantMessage("这是第二部作品的讨论。")]);
    await app.command({ ...command, requestId: randomUUID(), workId: b.workId, taskId: b.taskId });
    await waitFor(() => !app.active, "第二部作品完成讨论");
    assert.match((await app.snapshot(bId)).task!.messages.map(m => m.text).join("\n"), /第二部作品/);
    assert.doesNotMatch((await app.snapshot(a.workId)).task!.messages.map(m => m.text).join("\n"), /第二部作品/);
  } finally { release(); await app.close(); await fx.cleanup(); }
});

test("正式资料必须确认具体变更；拒绝和过期回答不写入，重启保留作者记录", async () => {
  const fx = await openFixture(); fx.session.dispose();
  let app = new LocalApp({ config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } });
  try {
    const task = (await app.snapshot(fx.work.workId)).task!;
    const send = (action: object) => app.command({ ...action, workId: task.workId, taskId: task.taskId, requestId: randomUUID() } as Parameters<LocalApp["command"]>[0]);
    const change = { type: "world_node", op: "upsert", parent_id: null, node: { id: "inn", kind: "location", title: "旧驿站", summary: "风雨中的驿站", content: "掌柜在等待旅人。" } };
    const write = (confirmation: string) => fauxAssistantMessage([fauxToolCall("write_canon", { changes: [change], author_confirmation: confirmation })]);
    fx.faux.context.setResponses([write("写入"), fauxAssistantMessage("请确认页面上的具体设定。")]);
    await send({ kind: "message", text: "把旧驿站设定写入" }); await waitFor(() => !app.active, "等待具体确认");
    let state = (await app.snapshot(task.workId)).task!;
    const decision = state.decision!; assert.ok(decision); assert.match(decision.detail, /掌柜在等待旅人/);
    assert.doesNotMatch(readFileSync(join(fx.work.workDir, "canon", "world.json"), "utf8"), /旧驿站/);
    fx.faux.context.setResponses([fauxAssistantMessage("先不写入，保留为讨论。")]);
    await send({ kind: "decide", decisionId: decision.id, answer: "暂不写入" }); await waitFor(() => !app.active, "拒绝决定");
    await assert.rejects(send({ kind: "decide", decisionId: decision.id, answer: "确认写入" }), /过期/);
    fx.faux.context.setResponses([write("写入"), fauxAssistantMessage("请确认。")]);
    await send({ kind: "message", text: "现在请写入同一个设定" }); await waitFor(() => !app.active, "新的具体确认");
    state = (await app.snapshot(task.workId)).task!;
    fx.faux.context.setResponses([write("确认写入"), fauxAssistantMessage("设定已保存。")]);
    await send({ kind: "decide", decisionId: state.decision!.id, answer: "确认写入" }); await waitFor(() => !app.active, "资料写入完成");
    assert.match(readFileSync(join(fx.work.workDir, "canon", "world.json"), "utf8"), /旧驿站/);
    const before = (await app.snapshot(task.workId)).task!;
    await app.close();
    app = new LocalApp({ config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } });
    const after = (await app.snapshot(task.workId)).task!;
    assert.deepEqual(after.messages, before.messages);
    assert.equal(after.taskId, task.taskId); assert.equal(app.active, null);
  } finally { await app.close(); await fx.cleanup(); }
});

for (const heldRole of ["writer", "reviewer", "sync_checker"] as const) {
  test(`整体停止覆盖 ${heldRole}，完成前阻止另一作品，迟到通知不重启任务`, async () => {
    const fx = await openFixture(); fx.session.dispose();
    let app = new LocalApp({ config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } });
    let release = () => {}; let reached = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { reached = resolve; });
    const hold = async () => { reached(); await gate; return fauxAssistantMessage("本轮结束。"); };
    try {
      const task = (await app.snapshot(fx.work.workId)).task!;
      const other = (await app.snapshot((await app.create()).workId)).task!;
      const send = (action: object, target = task) => app.command({ ...action, workId: target.workId, taskId: target.taskId, requestId: randomUUID() } as Parameters<LocalApp["command"]>[0]);
      const brief = { schema_version: 1, id: "b1", chapter_id: "ch1", mode: "write_chapter", intent: "旅人推开木门", requirements: [], constraints: [], ending: null, creative_scope: [], leave_open: [] };
      fx.faux.writer.setResponses(heldRole === "writer" ? [hold] : [
        fauxAssistantMessage([fauxToolCall("write", { path: "plan.md", content: "# 方案\n旅人推门。" })]),
        fauxAssistantMessage([fauxToolCall("submit_plan", {})]),
        fauxAssistantMessage([fauxToolCall("write", { path: "draft.md", content: "# 门前\n\n旅人推开木门。" })]),
        fauxAssistantMessage([fauxToolCall("submit_draft", {})]), fauxAssistantMessage("写完。"),
      ]);
      fx.faux.reviewer.setResponses([hold]); fx.faux.sync_checker.setResponses([hold]);
      fx.faux.context.setResponses([
        fauxAssistantMessage([fauxToolCall("save_package", { brief, pack: "## 未知\n来源：无\n人物来历未知。" })]),
        fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "writer", package_id: "package_1" , task: "完成本次安排"})]), fauxAssistantMessage("等待写手。"),
        ...(heldRole === "reviewer" ? [fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "reviewer", draft_id: "draft_1" , task: "完成本次安排"})]), fauxAssistantMessage("等待检查。")]: [fauxAssistantMessage("正文已保存，检查未完成。")]),
      ]);
      await send({ kind: "message", text: "写一个开门的短章" });
      if (heldRole === "sync_checker") {
        await waitFor(() => !app.active, "保存初稿");
        const draft = (await app.snapshot(task.workId)).task!.drafts[0]!;
        fx.faux.context.setResponses([
          fauxAssistantMessage([fauxToolCall("save_sync_proposal", { chapter_id: "ch1", changes: [{ id: "summary", change: { type: "chapter_meta", chapter_id: "ch1", summary: "旅人推开木门。", key_characters: [] }, evidence: ["旅人推开木门"], rationale: "关键行动" }] })]),
          fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "sync_checker", proposal_id: "proposal_1" , task: "完成本次安排"})]), fauxAssistantMessage("等待核对。"),
        ]);
        await send({ kind: "finalize", draftId: draft.draftId, fingerprint: draft.fingerprint, confirmed: true });
      }
      await entered;
      assert.equal((await app.snapshot(task.workId)).task!.agents.some(a => a.role === heldRole && a.status === "running"), true);
      const stopping = send({ kind: "stop" });
      assert.equal((await app.snapshot(task.workId)).task!.status, "stopping");
      await assert.rejects(send({ kind: "message", text: "开始另一部作品" }, other), /正在执行/);
      release(); await stopping;
      const stopped = (await app.snapshot(task.workId)).task!;
      assert.equal(stopped.status, "stopped"); assert.equal(stopped.agents.some(a => a.status === "running"), false);
      if (heldRole === "sync_checker") { assert.equal(stopped.drafts[0]?.finalized, true); assert.deepEqual(stopped.pendingChapters, ["ch1"]); }
      await app.close();
      app = new LocalApp({ config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } });
      await app.recover();
      assert.equal(app.active, null);
      assert.equal((await app.snapshot(task.workId)).task!.status, "stopped");
      fx.faux.context.setResponses([fauxAssistantMessage("第二部作品可以开始了。")]);
      await send({ kind: "message", text: "现在开始讨论" }, other); await waitFor(() => !app.active, "另一部作品完成");
      assert.equal((await app.snapshot(task.workId)).task!.status, "stopped");
    } finally { release(); await app.close(); await fx.cleanup(); }
  });
}

test("服务退出如实标记中断；查看不启动模型，明确继续复用原任务", async () => {
  const fx = await openFixture(); fx.session.dispose();
  let app = new LocalApp({ config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } });
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    const task = (await app.snapshot(fx.work.workId)).task!;
    fx.faux.context.setResponses([async () => { await gate; return fauxAssistantMessage("未完成的回复"); }]);
    await app.command({ ...task, kind: "message", requestId: randomUUID(), text: "讨论一个新开场" });
    const closing = app.close(); release(); await closing;
    app = new LocalApp({ config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } });
    const restored = (await app.snapshot(task.workId)).task!;
    assert.equal(restored.status, "interrupted"); assert.equal(restored.taskId, task.taskId); assert.equal(app.active, null);
    fx.faux.context.setResponses([fauxAssistantMessage("根据保存的讨论继续。")]);
    await app.command({ ...task, kind: "continue", requestId: randomUUID() }); await waitFor(() => !app.active, "继续中断任务");
    assert.match((await app.snapshot(task.workId)).task!.messages.map(m => m.text).join("\n"), /根据保存的讨论继续/);
  } finally { release(); await app.close(); await fx.cleanup(); }
});

test("启动恢复未完成同步使用服务通知，保留定稿且不伪造作者确认", async () => {
  const fx = await openFixture(); fx.session.dispose();
  const options = { config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } };
  let app = new LocalApp(options);
  let release = () => {}; let reached = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  const entered = new Promise<void>(resolve => { reached = resolve; });
  try {
    const task = (await app.snapshot(fx.work.workId)).task!;
    const send = (action: object) => app.command({ ...action, workId: task.workId, taskId: task.taskId, requestId: randomUUID() } as Parameters<LocalApp["command"]>[0]);
    fx.faux.writer.setResponses([
      fauxAssistantMessage([fauxToolCall("write", { path: "plan.md", content: "# 方案\n旅人推门。" })]), fauxAssistantMessage([fauxToolCall("submit_plan", {})]),
      fauxAssistantMessage([fauxToolCall("write", { path: "draft.md", content: "# 门前\n\n旅人推开木门。" })]), fauxAssistantMessage([fauxToolCall("submit_draft", {})]), fauxAssistantMessage("正文已保存。"),
    ]);
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("save_package", { brief: { schema_version: 1, id: "b1", chapter_id: "ch1", mode: "write_chapter", intent: "旅人推开木门", requirements: [], constraints: [], ending: null, creative_scope: [], leave_open: [] }, pack: "## 未知\n来源：无\n人物来历未知。" })]),
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "writer", package_id: "package_1" , task: "完成本次安排"})]), fauxAssistantMessage("等待写手。"), fauxAssistantMessage("已交稿，尚未检查。"),
    ]);
    await send({ kind: "message", text: "写旅人推门" }); await waitFor(() => !app.active, "交稿");
    const draft = (await app.snapshot(task.workId)).task!.drafts[0]!;
    fx.faux.context.setResponses([async () => { reached(); await gate; return fauxAssistantMessage("未完成的同步"); }]);
    await send({ kind: "finalize", draftId: draft.draftId, fingerprint: draft.fingerprint, confirmed: true }); await entered;
    const before = (await app.snapshot(task.workId)).task!;
    const closing = app.close(); release(); await closing;
    app = new LocalApp(options);
    fx.faux.sync_checker.setResponses([fauxAssistantMessage([fauxToolCall("save_sync_check", { verdicts: [{ change_id: "summary", verdict: "supported", reason: "正文中的行动", conflicting_ids: [] }] })]), fauxAssistantMessage("核对通过。")]);
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("save_sync_proposal", { chapter_id: "ch1", changes: [{ id: "summary", change: { type: "chapter_meta", chapter_id: "ch1", summary: "旅人推开木门。", key_characters: [] }, evidence: ["旅人推开木门"], rationale: "关键行动" }] })]),
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "sync_checker", proposal_id: "proposal_1" , task: "完成本次安排"})]), fauxAssistantMessage("等待核对。"),
      fauxAssistantMessage([fauxToolCall("apply_sync", { proposal_id: "proposal_1", change_ids: ["summary"] })]), fauxAssistantMessage("同步完成。"),
    ]);
    await app.recover(); await waitFor(() => !app.active, "启动后完成同步");
    const after = (await app.snapshot(task.workId)).task!;
    assert.deepEqual(after.messages.filter(m => m.role === "user"), before.messages.filter(m => m.role === "user"));
    assert.ok(after.messages.some(m => m.role === "notice" && m.text.includes("服务已重新启动")));
    assert.equal(after.drafts[0]?.finalized, true); assert.deepEqual(after.pendingChapters, []);
    assert.equal(latestTask(fx.work).registry.finalizations.length, 1);
    assert.equal(after.agents.find(a => a.role === "writer")?.status, "terminated");
  } finally { release(); await app.close(); await fx.cleanup(); }
});

test("连续两轮保留同一冲突后交稿，旧稿与遗留问题不会被显示为检查通过或定稿", async () => {
  const fx = await openFixture(); fx.session.dispose();
  const app = new LocalApp({ config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } });
  try {
    const task = (await app.snapshot(fx.work.workId)).task!;
    const brief = { schema_version: 1, id: "b1", chapter_id: "ch1", mode: "write_chapter", intent: "旅人进屋", requirements: ["旅人必须推开木门"], constraints: [], ending: null, creative_scope: [], leave_open: [] };
    const draft = (body: string) => [fauxAssistantMessage([fauxToolCall("write", { path: "draft.md", content: `# 门前\n\n${body}` })]), fauxAssistantMessage([fauxToolCall("submit_draft", {})]), fauxAssistantMessage("正文已保存。")];
    fx.faux.writer.setResponses([
      fauxAssistantMessage([fauxToolCall("write", { path: "plan.md", content: "# 方案\n旅人推开木门。" })]), fauxAssistantMessage([fauxToolCall("submit_plan", {})]), fauxAssistantMessage("方案已保存。"),
      ...draft("旅人在门外站住，没有进屋。"), ...draft("旅人在木门外站住，没有进屋。"),
    ]);
    const review = { schema_version: 1, chapter_id: "ch1", checks: { requirements: "failed", character_motivation: "passed", possessions_and_abilities: "passed", ability_rules: "passed" }, feedback: [{ kind: "violation", category: "requirements", location: { excerpt: "没有进屋", description: "正文结尾" }, reason: "未落实推门要求", evidence: [{ source_id: "b1", locator: "requirements[0]", excerpt: "旅人必须推开木门" }], revision_goal: "写出推门行动" }] };
    fx.faux.reviewer.setResponses([
      fauxAssistantMessage([fauxToolCall("save_review", { review })]), fauxAssistantMessage("发现要求冲突。"),
      fauxAssistantMessage([fauxToolCall("save_review", { review })]), fauxAssistantMessage("同一要求冲突仍未解决。"),
    ]);
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("save_package", { brief, pack: "## 未知\n来源：无\n人物来历未知。" })]), fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "writer", package_id: "package_1" , task: "完成本次安排"})]), fauxAssistantMessage("等待方案。"),
      fauxAssistantMessage([fauxToolCall("send_message", { agent_id: "writer-1", message: "方案通过，写正文。" })]), fauxAssistantMessage("等待正文。"),
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "reviewer", draft_id: "draft_1" , task: "完成本次安排"})]), fauxAssistantMessage("等待首轮检查。"),
      fauxAssistantMessage([fauxToolCall("send_message", { agent_id: "writer-1", message: "没有进屋违反 b1 的推门要求，请写出推门行动。" })]), fauxAssistantMessage("等待返修。"),
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "reviewer", draft_id: "draft_2" , task: "完成本次安排"})]), fauxAssistantMessage("等待复查。"),
      fauxAssistantMessage("同一冲突连续两轮未解决，数量未下降，停止自动返修并交稿。遗留问题：未落实推门要求。尚未定稿。"),
    ]);
    await app.command({ ...task, kind: "message", requestId: randomUUID(), text: "写一章，旅人必须推开木门" });
    await waitFor(() => !app.active, "保留问题交稿");
    const state = (await app.snapshot(task.workId)).task!;
    assert.equal(state.status, "idle"); assert.equal(state.drafts.length, 2);
    for (const saved of state.drafts) { assert.equal(saved.review, "issues"); assert.equal(saved.finalized, false); assert.match(saved.reviewText, /未落实推门要求/); }
    assert.equal(state.agents.filter(a => a.role === "reviewer").length, 2);
    assert.match(state.messages.at(-1)!.text, /停止自动返修.*遗留问题/);
    assert.match((await app.draft(task, "draft_1")).markdown, /旅人在门外/);
  } finally { await app.close(); await fx.cleanup(); }
});

test("原方向修改复用写手，改变方向必须经过页面决定且保留旧版", async () => {
  const fx = await openFixture(); fx.session.dispose();
  const app = new LocalApp({ config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } });
  try {
    const task = (await app.snapshot(fx.work.workId)).task!;
    const send = (action: object) => app.command({ ...action, workId: task.workId, taskId: task.taskId, requestId: randomUUID() } as Parameters<LocalApp["command"]>[0]);
    const brief = { schema_version: 1, id: "b1", chapter_id: "ch1", mode: "write_chapter", intent: "旅人推开木门", requirements: [], constraints: [], ending: null, creative_scope: ["细节自由安排"], leave_open: [] };
    const pack = "## 未知\n来源：无\n人物来历未知。";
    const writer = (body: string) => [
      fauxAssistantMessage([fauxToolCall("write", { path: "plan.md", content: "# 方案\n旅人选择推门。" })]), fauxAssistantMessage([fauxToolCall("submit_plan", {})]),
      fauxAssistantMessage([fauxToolCall("write", { path: "draft.md", content: `# 门前\n\n${body}` })]), fauxAssistantMessage([fauxToolCall("submit_draft", {})]), fauxAssistantMessage("提交完成。"),
    ];
    const review = { schema_version: 1, chapter_id: "ch1", checks: { requirements: "passed", character_motivation: "passed", possessions_and_abilities: "passed", ability_rules: "passed" }, feedback: [] };
    const check = () => fx.faux.reviewer.setResponses([fauxAssistantMessage([fauxToolCall("save_review", { review })]), fauxAssistantMessage("检查完成。")]);
    const contextTail = (id: string) => [fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "reviewer", draft_id: id , task: "完成本次安排"})]), fauxAssistantMessage("正在检查。"), fauxAssistantMessage("本版已交付。")];
    check(); fx.faux.writer.setResponses(writer("旅人推开木门。"));
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("save_package", { brief, pack })]), fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "writer", package_id: "package_1" , task: "完成本次安排"})]), fauxAssistantMessage("等待写手。"), ...contextTail("draft_1"),
    ]);
    await send({ kind: "message", text: "写旅人推门" }); await waitFor(() => !app.active, "原稿交付");
    check(); fx.faux.writer.setResponses([
      fauxAssistantMessage([fauxToolCall("write", { path: "draft.md", content: "# 门前\n\n旅人在雨中推开木门。" })]), fauxAssistantMessage([fauxToolCall("submit_draft", {})]), fauxAssistantMessage("沿原方向改好。"),
    ]);
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("save_package", { brief: { ...brief, id: "b2", requirements: ["增加下雨的环境"] }, pack })]),
      fauxAssistantMessage([fauxToolCall("send_message", { agent_id: "writer-1", package_id: "package_2", message: "沿原方向增加雨景" })]), fauxAssistantMessage("原写手正在修改。"), ...contextTail("draft_2"),
    ]);
    await send({ kind: "message", text: "沿原方向加下雨的环境", draftId: "draft_1" }); await waitFor(() => !app.active, "局部修改完成");
    let state = (await app.snapshot(task.workId)).task!;
    assert.equal(state.agents.filter(a => a.role === "writer").length, 1);
    assert.match((await app.draft(task, "draft_2")).markdown, /雨中/);
    fx.faux.context.setResponses([fauxAssistantMessage([fauxToolCall("ask_author", { question: "改变关键结果？", detail: "旅人不再推门，改为转身离去。", options: ["确认重写", "保留原方向"], draft_id: "draft_2" })]), fauxAssistantMessage("等待作者决定。")]);
    await send({ kind: "message", text: "想让旅人不进门而离开", draftId: "draft_2" }); await waitFor(() => !app.active, "等待新方向确认");
    state = (await app.snapshot(task.workId)).task!;
    assert.equal(state.drafts.length, 2); assert.ok(state.decision);
    check(); fx.faux.writer.setResponses(writer("旅人没有推门，转身走入雨中。"));
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("save_package", { brief: { ...brief, id: "b3", intent: "旅人放弃推门，转身离开" }, pack })]),
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "writer", package_id: "package_3" , task: "完成本次安排"})]), fauxAssistantMessage("按确认的新方向重新安排写手。"), ...contextTail("draft_3"),
    ]);
    await send({ kind: "decide", decisionId: state.decision!.id, answer: "确认重写" }); await waitFor(() => !app.active, "新方向交稿");
    state = (await app.snapshot(task.workId)).task!;
    assert.equal(state.agents.find(a => a.id === "writer-1")?.status, "retired");
    assert.equal(state.agents.filter(a => a.role === "writer").length, 2);
    assert.match((await app.draft(task, "draft_3")).markdown, /转身走入/);
    assert.match((await app.draft(task, "draft_1")).markdown, /旅人推开木门/);
  } finally { await app.close(); await fx.cleanup(); }
});

for (const answer of ["以定稿正文为准", "保留原设定"]) {
  test(`同步冲突选择“${answer}”后正文保持定稿，章节元数据完成同步`, async () => {
    const fx = await openFixture(); fx.session.dispose();
    const app = new LocalApp({ config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } });
    try {
      const task = (await app.snapshot(fx.work.workId)).task!;
      const send = (action: object) => app.command({ ...action, workId: task.workId, taskId: task.taskId, requestId: randomUUID() } as Parameters<LocalApp["command"]>[0]);
      const node = { id: "inn", kind: "location", title: "旧驿站", summary: "驿站无人守候。", content: "驿站无人守候。" };
      const changes = [{ type: "world_node", op: "upsert", parent_id: null, node }];
      fx.faux.context.setResponses([fauxAssistantMessage([fauxToolCall("write_canon", { changes, author_confirmation: "记录" })]), fauxAssistantMessage("请确认。")]);
      await send({ kind: "message", text: "记录驿站无人守候" }); await waitFor(() => !app.active, "设定待确认");
      fx.faux.context.setResponses([fauxAssistantMessage([fauxToolCall("write_canon", { changes, author_confirmation: "确认写入" })]), fauxAssistantMessage("写入完成。")]);
      await send({ kind: "decide", decisionId: (await app.snapshot(task.workId)).task!.decision!.id, answer: "确认写入" }); await waitFor(() => !app.active, "原设定保存");
      const brief = { schema_version: 1, id: "b1", chapter_id: "ch1", mode: "write_chapter", intent: "掌柜等候旅人", requirements: [], constraints: [], ending: null, creative_scope: [], leave_open: [] };
      fx.faux.writer.setResponses([
        fauxAssistantMessage([fauxToolCall("write", { path: "plan.md", content: "# 方案\n掌柜等候。" })]), fauxAssistantMessage([fauxToolCall("submit_plan", {})]),
        fauxAssistantMessage([fauxToolCall("write", { path: "draft.md", content: "# 等候\n\n掌柜一直在驿站等他。" })]), fauxAssistantMessage([fauxToolCall("submit_draft", {})]), fauxAssistantMessage("已保存正文。"),
      ]);
      fx.faux.context.setResponses([fauxAssistantMessage([fauxToolCall("save_package", { brief, pack: "## 驿站\n来源：inn\n驿站无人守候。" })]), fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "writer", package_id: "package_1" , task: "完成本次安排"})]), fauxAssistantMessage("正在写。"), fauxAssistantMessage("正文保存，尚未检查。")]);
      await send({ kind: "message", text: "写掌柜等人的一段" }); await waitFor(() => !app.active, "初稿保存");
      const proposal: Parameters<typeof fauxToolCall>[1] = { chapter_id: "ch1", changes: [
        { id: "summary", change: { type: "chapter_meta", chapter_id: "ch1", summary: "掌柜在驿站等候旅人。", key_characters: [] }, evidence: ["掌柜一直在驿站等他"], rationale: "正文的行动" },
        { id: "inn-change", change: { type: "world_node", op: "upsert", parent_id: null, node: { ...node, summary: "掌柜在驿站等候。", content: "掌柜一直在驿站等他。" } }, evidence: ["掌柜一直在驿站等他"], rationale: "驿站状态变化" },
      ] };
      fx.faux.sync_checker.setResponses([fauxAssistantMessage([fauxToolCall("save_sync_check", { verdicts: [
        { change_id: "summary", verdict: "supported", reason: "实际剧情", conflicting_ids: [] },
        { change_id: "inn-change", verdict: "conflict", reason: "正文有人等候，既有资料无人守候。", conflicting_ids: ["inn"] },
      ] })]), fauxAssistantMessage("有一项冲突。")]);
      fx.faux.context.setResponses([
        fauxAssistantMessage([fauxToolCall("save_sync_proposal", proposal)]), fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "sync_checker", proposal_id: "proposal_1" , task: "完成本次安排"})]), fauxAssistantMessage("正在核对。"),
        fauxAssistantMessage([fauxToolCall("apply_sync", { proposal_id: "proposal_1", change_ids: ["summary", "inn-change"] })]), fauxAssistantMessage("请决定冲突。"),
      ]);
      const draft = (await app.snapshot(task.workId)).task!.drafts[0]!;
      await send({ kind: "finalize", draftId: draft.draftId, fingerprint: draft.fingerprint, confirmed: true }); await waitFor(() => !app.active, "等待冲突决定");
      const before = (await app.snapshot(task.workId)).task!;
      assert.equal(before.drafts[0]?.finalized, true); assert.deepEqual(before.pendingChapters, ["ch1"]);
      assert.match(before.decision!.detail, /正文依据/); assert.match(before.decision!.detail, /无人守候/);
      fx.faux.context.setResponses([fauxAssistantMessage([fauxToolCall("apply_sync", { proposal_id: "proposal_1", change_ids: answer === "以定稿正文为准" ? ["summary", "inn-change"] : ["summary"], ...(answer === "以定稿正文为准" ? { author_confirmation: answer } : {}) })]), fauxAssistantMessage("按你的决定同步完成。")]);
      await send({ kind: "decide", decisionId: before.decision!.id, answer }); await waitFor(() => !app.active, "冲突处理完成");
      const after = (await app.snapshot(task.workId)).task!;
      assert.deepEqual(after.pendingChapters, []); assert.equal(after.drafts[0]?.finalized, true);
      const world = readFileSync(join(fx.work.workDir, "canon", "world.json"), "utf8");
      assert.match(world, answer === "以定稿正文为准" ? /掌柜一直在驿站等他/ : /驿站无人守候/);
    } finally { await app.close(); await fx.cleanup(); }
  });
}
