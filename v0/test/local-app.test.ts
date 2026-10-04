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
  const app = new LocalApp({ config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } });
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
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "writer", package_id: "package_1" })]), fauxAssistantMessage("正在准备章节方案。"),
      fauxAssistantMessage([fauxToolCall("send_message", { agent_id: "writer-1", message: "方案通过，写正文。" })]), fauxAssistantMessage("正在写正文。"),
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "reviewer", draft_id: "draft_1" })]), fauxAssistantMessage("正在检查。"),
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
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "reviewer", draft_id: "draft_2" })]), fauxAssistantMessage("措辞已改，正在复查。"),
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
    fx.faux.context.setResponses([fauxAssistantMessage("同步暂未完成，请稍后继续。")]);
    const finalize = { kind: "finalize", draftId: "draft_1", fingerprint: state.drafts[0]!.fingerprint, confirmed: true };
    await command(finalize);
    await waitFor(() => !app.active, "定稿后本轮结束");
    state = (await app.snapshot(task.workId)).task!;
    assert.equal(state.drafts[0]?.finalized, true);
    assert.deepEqual(state.pendingChapters, ["ch1"]);
    await assert.rejects(command(finalize), /状态已变化/);
    const changes = [{ id: "summary", change: { type: "chapter_meta", chapter_id: "ch1", summary: "旅人推门，听见屋内叹息。", key_characters: [] }, evidence: ["旅人推开木门"], rationale: "这是正文的关键行动" }];
    fx.faux.sync_checker.setResponses([fauxAssistantMessage([fauxToolCall("save_sync_check", { verdicts: [{ change_id: "summary", verdict: "supported", reason: "正文明确写出推门", conflicting_ids: [] }] })]), fauxAssistantMessage("核对通过。")]);
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("save_sync_proposal", { chapter_id: "ch1", changes })]),
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "sync_checker", proposal_id: "proposal_1" })]), fauxAssistantMessage("继续核对。"),
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
    await app.command(command);
    await app.command(command);
    await assert.rejects(app.command({ ...command, requestId: randomUUID(), workId: b.workId, taskId: b.taskId }), /正在执行/);
    assert.equal((await app.snapshot(bId)).active?.workId, a.workId);
    const stopping = app.command({ ...command, kind: "stop", requestId: randomUUID() });
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
    const app = new LocalApp({ config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } });
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
        fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "writer", package_id: "package_1" })]), fauxAssistantMessage("等待写手。"),
        ...(heldRole === "reviewer" ? [fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "reviewer", draft_id: "draft_1" })]), fauxAssistantMessage("等待检查。")]: [fauxAssistantMessage("正文已保存，检查未完成。")]),
      ]);
      await send({ kind: "message", text: "写一个开门的短章" });
      if (heldRole === "sync_checker") {
        await waitFor(() => !app.active, "保存初稿");
        const draft = (await app.snapshot(task.workId)).task!.drafts[0]!;
        fx.faux.context.setResponses([
          fauxAssistantMessage([fauxToolCall("save_sync_proposal", { chapter_id: "ch1", changes: [{ id: "summary", change: { type: "chapter_meta", chapter_id: "ch1", summary: "旅人推开木门。", key_characters: [] }, evidence: ["旅人推开木门"], rationale: "关键行动" }] })]),
          fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "sync_checker", proposal_id: "proposal_1" })]), fauxAssistantMessage("等待核对。"),
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
