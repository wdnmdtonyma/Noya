import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, mock } from "node:test";
import { syncBuiltinESMExports } from "node:module";
import { git } from "../src/util.ts";
import { loadCanon, saveCanon, cloneCanon } from "../src/canon.ts";
import { LocalApp } from "../src/local-app.ts";
import { startLocalServer } from "../src/local-server.ts";
import { fauxAssistantMessage, fauxToolCall, openFixture, waitFor } from "./harness.ts";
import fsPromises from "node:fs/promises";
import fs, { writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createWork, loadRegistry, taskLayout } from "../src/layout.ts";

test("同作品创建持久去重，返回非最新任务继续，浏览不打开模型", async () => {
  const fx = await openFixture(); fx.session.dispose();
  const options = { config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } };
  let app = new LocalApp(options);
  let server = await startLocalServer(app, { port: 0 });
  try {
    const a = (await app.snapshot(fx.work.workId)).task!;
    fx.faux.context.setResponses([fauxAssistantMessage("只属于旧任务的讨论。")]);
    await app.command({ ...a, kind: "message", text: "探索雨夜的来客", requestId: randomUUID() });
    await waitFor(() => !app.active, "A 讨论完成");
    const requestId = randomUUID();
    const create = () => fetch(`${server.url}/api/tasks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workId: a.workId, requestId }) }).then(async r => { assert.equal(r.status, 200); return r.json(); });
    const [b, retry] = await Promise.all([create(), create()]);
    assert.deepEqual(b, retry); assert.notEqual(b.taskId, a.taskId);
    const blank = await app.snapshot(b.workId, b.taskId);
    assert.deepEqual(blank.task!.messages, []); assert.equal(blank.active, null);
    assert.equal(blank.tasks.length, 2);
    assert.equal(blank.tasks.find(t => t.taskId === a.taskId)!.name, "探索雨夜的来客");
    await server.close(); app = new LocalApp(options); server = await startLocalServer(app, { port: 0 });
    assert.deepEqual(await create(), b);
    fx.faux.context.setResponses([fauxAssistantMessage("继续旧任务的雨夜。")]);
    await app.command({ ...a, kind: "message", text: "接着聊", requestId: randomUUID() });
    await waitFor(() => !app.active, "返回 A");
    assert.match((await app.snapshot(a.workId, a.taskId)).task!.messages.map(m => m.text).join("\n"), /只属于旧任务.*\n.*继续旧任务/s);
    assert.deepEqual((await app.snapshot(b.workId, b.taskId)).task!.messages, []);
    const missing = await app.snapshot(a.workId, "missing"); assert.equal(missing.task, null); assert.match(missing.selectionError!, /任务/);
  } finally { await server.close(); await fx.cleanup(); }
});

test("新任务的直接读取与根目录搜索不泄漏旧任务材料，正式资料和当前材料仍可读", async () => {
  const fx = await openFixture(); fx.session.dispose();
  const app = new LocalApp({ config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } });
  try {
    const a = (await app.snapshot(fx.work.workId)).task!;
    writeFileSync(join(fx.work.workDir, "tasks", a.taskId, "secret.md"), "UNACCEPTED_SECRET_A");
    const b = await app.createTask(a.workId, randomUUID());
    writeFileSync(join(fx.work.workDir, "tasks", b.taskId, "own.md"), "CURRENT_TASK_B");
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("read", { path: `tasks/${a.taskId}/secret.md` })]),
      fauxAssistantMessage([fauxToolCall("grep", { pattern: "UNACCEPTED_SECRET_A", path: "." })]),
      fauxAssistantMessage([fauxToolCall("find", { pattern: "**/*.md", path: "." })]),
      fauxAssistantMessage([fauxToolCall("ls", { path: "tasks" })]),
      fauxAssistantMessage([fauxToolCall("read", { path: `tasks/${b.taskId}/own.md` })]),
      fauxAssistantMessage([fauxToolCall("read", { path: "canon/world.json" })]),
      fauxAssistantMessage("查询结束。"),
    ]);
    await app.command({ ...b, kind: "message", text: "查阅资料", requestId: randomUUID() });
    await waitFor(() => !app.active, "隔离查询完成");
    const log = readFileSync(loadRegistry(taskLayout(fx.work, b.taskId)).context_session_file, "utf8").split("\n").map(l => l ? JSON.parse(l) : null).filter(e => e?.message?.role === "toolResult").map(e => e.message.content.map((c: { text?: string }) => c.text ?? "").join("\n"));
    assert.equal(log.length, 6);
    for (const result of log.slice(0, 4)) { assert.match(result, /拒绝/); assert.doesNotMatch(result, /UNACCEPTED_SECRET_A/); }
    assert.match(log[4]!, /CURRENT_TASK_B/); assert.match(log[5]!, /schema_version/);
  } finally { await app.close(); await fx.cleanup(); }
});

test("损坏任务独立列出，空目录不能伪装健康任务；并发首次打开只登记一次", async () => {
  const fx = await openFixture(); fx.session.dispose();
  const app = new LocalApp({ config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } });
  try {
    const a = (await app.snapshot(fx.work.workId)).task!;
    mkdirSync(join(fx.work.workDir, "tasks", "broken"));
    const state = await app.snapshot(a.workId, a.taskId);
    assert.equal(state.task!.taskId, a.taskId); assert.match(state.tasks.find(t => t.taskId === "broken")!.error!, /损坏|缺失/);
    const broken = await app.snapshot(a.workId, "broken"); assert.equal(broken.task, null); assert.ok(broken.selectionError);
    const emptyWork = await createWork(fx.config.worksRoot, fx.work.agentDir);
    const [first, concurrent] = await Promise.all([app.snapshot(emptyWork.workId), app.snapshot(emptyWork.workId)]);
    assert.equal(first.task!.taskId, concurrent.task!.taskId); assert.equal(concurrent.tasks.length, 1);
    const other = await app.create();
    await assert.rejects(app.command({ workId: other.workId, taskId: a.taskId, kind: "message", text: "不串作品", requestId: randomUUID() }), /任务/);
  } finally { await app.close(); await fx.cleanup(); }
});

async function writeDraft(fx: Awaited<ReturnType<typeof openFixture>>, app: LocalApp, ref: { workId: string; taskId: string }, body = "旅人推开木门，雨水落在门槛上。") {
  fx.faux.writer.setResponses([
    fauxAssistantMessage([fauxToolCall("write", { path: "plan.md", content: "# 方案\n旅人推门。" })]), fauxAssistantMessage([fauxToolCall("submit_plan", {})]),
    fauxAssistantMessage([fauxToolCall("write", { path: "draft.md", content: `# 雨夜\n\n${body}` })]), fauxAssistantMessage([fauxToolCall("submit_draft", {})]), fauxAssistantMessage("已保存。"),
  ]);
  fx.faux.context.setResponses([
    fauxAssistantMessage([fauxToolCall("save_package", { brief: { schema_version: 1, id: "b1", chapter_id: "ch1", mode: "write_chapter", intent: "推开木门", requirements: [], constraints: [], ending: null, creative_scope: [], leave_open: [] }, pack: "## 未知\n来源：无\n人物来历未知。" })]),
    fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "writer", package_id: "package_1" , task: "完成本次安排"})]), fauxAssistantMessage("等待写手。"), fauxAssistantMessage("交稿。"),
  ]);
  await app.command({ ...ref, kind: "message", text: "写雨夜开门", requestId: randomUUID() }); await waitFor(() => !app.active, "保存初稿");
}
const summaryProposal = { chapter_id: "ch1", changes: [{ id: "summary", change: { type: "chapter_meta", chapter_id: "ch1", summary: "旅人开门。", key_characters: [] }, evidence: ["旅人推开木门"], rationale: "实际行动" }] };

test("相同正文重新定稿也转移同步归属，非负责工具和旧决定均不能写入", async () => {
  const fx = await openFixture(); fx.session.dispose();
  const app = new LocalApp({ config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } });
  try {
    const a = (await app.snapshot(fx.work.workId)).task!;
    const b = await app.createTask(a.workId, randomUUID());
    await writeDraft(fx, app, a); await writeDraft(fx, app, b);
    assert.equal((await app.draft(a, "draft_1")).markdown, (await app.draft(b, "draft_1")).markdown);
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("save_sync_proposal", summaryProposal)]),
      fauxAssistantMessage([fauxToolCall("ask_author", { question: "保留这个方向？", detail: "请确认同步方向。", options: ["保留", "再想想"] })]), fauxAssistantMessage("等待决定。"),
    ]);
    await app.command({ ...a, kind: "finalize", draftId: "draft_1", fingerprint: (await app.draft(a, "draft_1")).fingerprint, confirmed: true, requestId: randomUUID() }); await waitFor(() => !app.active, "A 待决定");
    const before = (await app.snapshot(a.workId, a.taskId)).task!;
    assert.equal(before.pendingSync[0]!.owner!.taskId, a.taskId);
    fx.faux.context.setResponses([fauxAssistantMessage([fauxToolCall("save_sync_proposal", summaryProposal)]), fauxAssistantMessage("回到原任务。")]);
    await app.command({ ...b, kind: "continue", requestId: randomUUID() }); await waitFor(() => !app.active, "B 不接管");
    const denied = readFileSync(loadRegistry(taskLayout(fx.work, b.taskId)).context_session_file, "utf8");
    const refusals = denied.split("\n").filter(Boolean).map(line => JSON.parse(line)).filter(e => e.message?.role === "toolResult" && e.message.toolName === "save_sync_proposal").map(e => e.message.content.map((c: { text?: string }) => c.text ?? "").join("\n"));
    assert.match(refusals.at(-1)!, /\[拒绝\].*负责同步/);
    fx.faux.context.setResponses([fauxAssistantMessage("正文已保存，稍后同步。")]);
    await app.command({ ...b, kind: "finalize", draftId: "draft_1", fingerprint: (await app.draft(b, "draft_1")).fingerprint, confirmed: true, requestId: randomUUID() }); await waitFor(() => !app.active, "B 重新定稿");
    const after = (await app.snapshot(a.workId, a.taskId)).task!;
    assert.equal(after.drafts[0]!.finalized, false);
    assert.equal((await app.draft(b, "draft_1")).finalized, true);
    assert.equal(after.pendingSync[0]!.owner!.taskId, b.taskId);
    assert.notEqual(after.pendingSync[0]!.version, before.pendingSync[0]!.version);
    await assert.rejects(app.command({ ...a, kind: "decide", decisionId: before.decision!.id, answer: "保留", requestId: randomUUID() }), /过期/);
    await waitFor(() => !app.active, "过期决定释放占用");
    fx.faux.context.setResponses([fauxAssistantMessage([fauxToolCall("apply_sync", { proposal_id: "proposal_1", change_ids: ["summary"] })]), fauxAssistantMessage("返回 B 处理同步。")]);
    await app.command({ ...a, kind: "continue", requestId: randomUUID() }); await waitFor(() => !app.active, "旧任务不能应用清单");
    const log = readFileSync(loadRegistry(taskLayout(fx.work, a.taskId)).context_session_file, "utf8");
    const apply = log.split("\n").filter(Boolean).map(line => JSON.parse(line)).filter(e => e.message?.role === "toolResult" && e.message.toolName === "apply_sync").at(-1);
    assert.match(apply.message.content.map((c: { text?: string }) => c.text ?? "").join("\n"), /\[拒绝\].*负责同步/);
    assert.equal(loadCanon(fx.work.workDir).chapters.get("ch1")!.summary, "");
    assert.equal((await app.snapshot(b.workId, b.taskId)).task!.pendingSync[0]!.owner!.taskId, b.taskId);
  } finally { await app.close(); await fx.cleanup(); }
});

test("同作品运行中可新建和查看，停止停稳前不能发送或处理另一任务决定", async () => {
  const fx = await openFixture(); fx.session.dispose();
  const app = new LocalApp({ config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } });
  let release = () => {}, entered = () => {};
  const gate = new Promise<void>(r => { release = r; }); const reached = new Promise<void>(r => { entered = r; });
  try {
    const a = (await app.snapshot(fx.work.workId)).task!;
    fx.faux.context.setResponses([fauxAssistantMessage([fauxToolCall("ask_author", { question: "是否保留雨夜？", detail: "决定留在 A", options: ["保留", "放弃"] })]), fauxAssistantMessage("等待回答。")]);
    await app.command({ ...a, kind: "message", text: "讨论雨夜", requestId: randomUUID() }); await waitFor(() => !app.active, "等待决定释放占用");
    const decision = (await app.snapshot(a.workId, a.taskId)).task!.decision!;
    const b = await app.createTask(a.workId, randomUUID());
    fx.faux.context.setResponses([async () => { entered(); await gate; return fauxAssistantMessage("B 的迟到内容"); }]);
    await app.command({ ...b, kind: "message", text: "B 开始", requestId: randomUUID() }); await reached;
    const c = await app.createTask(a.workId, randomUUID());
    assert.equal((await app.snapshot(a.workId, a.taskId)).active!.taskId, b.taskId);
    assert.equal((await app.snapshot(c.workId, c.taskId)).task!.messages.length, 0);
    await assert.rejects(app.command({ ...a, kind: "decide", decisionId: decision.id, answer: "保留", requestId: randomUUID() }), /正在执行/);
    const stopping = app.command({ ...b, kind: "stop", requestId: randomUUID() });
    assert.equal((await app.snapshot(b.workId, b.taskId)).task!.status, "stopping");
    await assert.rejects(app.command({ ...c, kind: "message", text: "不能提前开始", requestId: randomUUID() }), /正在执行/);
    release(); await stopping;
    assert.equal(app.active, null); assert.equal((await app.snapshot(b.workId, b.taskId)).task!.status, "stopped");
    assert.equal((await app.snapshot(a.workId, a.taskId)).task!.decision!.id, decision.id);
    assert.equal((await app.snapshot(c.workId, c.taskId)).task!.messages.length, 0);
  } finally { release(); await app.close(); await fx.cleanup(); }
});

test("旧章节只能明确承接一次，停止、第三任务查看和重启均保留承接者", async () => {
  const fx = await openFixture(); fx.session.dispose();
  const options = { config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } }; let app = new LocalApp(options);
  try {
    const before = loadCanon(fx.work.workDir), after = cloneCanon(before);
    after.chapters.set("legacy", { schema_version: 1, id: "legacy", title: "旧章", order: 1, status: "finalized", content: "旅人推开木门。", summary: "", key_characters: [] }); after.sync.pending_chapter_ids.push("legacy");
    await saveCanon(fx.work.workDir, before, after);
    const a = (await app.snapshot(fx.work.workId)).task!; const b = await app.createTask(a.workId, randomUUID()); const c = await app.createTask(a.workId, randomUUID());
    const version = a.pendingSync[0]!.version;
    const results = await Promise.allSettled([b,c].map(ref => app.command({ ...ref, kind: "claim-sync", chapterId: "legacy", version, requestId: randomUUID() })));
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    assert.equal((await app.snapshot(a.workId, c.taskId)).task!.pendingSync[0]!.owner!.taskId, b.taskId);
    await app.close(); app = new LocalApp(options);
    await app.recover(); assert.equal(app.active, null);
    assert.equal((await app.snapshot(a.workId, a.taskId)).task!.pendingSync[0]!.owner!.taskId, b.taskId);
    await assert.rejects(app.command({ ...c, kind: "claim-sync", chapterId: "legacy", version, requestId: randomUUID() }), /负责同步/);
  } finally { await app.close(); await fx.cleanup(); }
});

test("同步归属写入中断可从定稿登记恢复，后来新空白任务不遮住恢复候选", async () => {
  const fx = await openFixture(); fx.session.dispose();
  const options = { config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } }; let app = new LocalApp(options);
  let release = () => {}, entered = () => {};
  const gate = new Promise<void>(r => { release = r; }); const reached = new Promise<void>(r => { entered = r; });
  try {
    const a = (await app.snapshot(fx.work.workId)).task!; await writeDraft(fx, app, a);
    fx.faux.context.setResponses([async () => { entered(); await gate; return fauxAssistantMessage("同步尚未完成"); }]);
    await app.command({ ...a, kind: "finalize", draftId: "draft_1", fingerprint: (await app.draft(a, "draft_1")).fingerprint, confirmed: true, requestId: randomUUID() }); await reached;
    const version = (await app.snapshot(a.workId, a.taskId)).task!.pendingSync[0]!.version;
    const b = await app.createTask(a.workId, randomUUID());
    const closing = app.close(); release(); await closing;
    rmSync(join(fx.work.runtimeDir, "sync-owners.json"));
    app = new LocalApp(options);
    fx.faux.context.setResponses([fauxAssistantMessage("原 Agent 已退出，我会使用保存材料继续同步。")]);
    await app.recover(); await waitFor(() => !app.active, "恢复 A 同步");
    const aAfter = (await app.snapshot(a.workId, a.taskId)).task!;
    assert.equal(aAfter.pendingSync[0]!.owner!.taskId, a.taskId); assert.equal(aAfter.pendingSync[0]!.version, version);
    assert.ok(aAfter.messages.some(m => m.role === "notice" && m.text.includes("服务已重新启动")));
    assert.equal(aAfter.drafts[0]!.finalized, true); assert.equal((await app.snapshot(b.workId, b.taskId)).task!.messages.length, 0);
    assert.equal(loadRegistry(taskLayout(fx.work,a.taskId)).finalizations.length, 1);
  } finally { release(); await app.close(); await fx.cleanup(); }
});

test("两个任务相同稿件编号，重启后引用非最新任务旧版修改仍留在原任务", async () => {
  const fx = await openFixture(); fx.session.dispose();
  const options = { config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } }; let app = new LocalApp(options);
  try {
    const a = (await app.snapshot(fx.work.workId)).task!; await writeDraft(fx, app, a);
    const b = await app.createTask(a.workId, randomUUID()); await writeDraft(fx, app, b, "旅人推开木门，阳光照亮庭院。");
    await app.close(); app = new LocalApp(options);
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("edit", { path: `tasks/${a.taskId}/revision.md`, edits: [{oldText:"雨水",newText:"冷雨"}] })]),
      fauxAssistantMessage([fauxToolCall("save_revision", {})]), fauxAssistantMessage("原写手已经退出，我使用指定旧版完成了措辞修改。"),
    ]);
    await app.command({ ...a, kind:"message", text:"把雨水改为冷雨", draftId:"draft_1", requestId:randomUUID() }); await waitFor(() => !app.active, "旧任务修改");
    assert.match((await app.draft(a,"draft_2")).markdown,/冷雨/); assert.match((await app.draft(a,"draft_1")).markdown,/雨水/);
    assert.match((await app.draft(b,"draft_1")).markdown,/阳光/); await assert.rejects(app.draft(b,"draft_2"),/不存在/);
    assert.ok((await app.snapshot(a.workId,a.taskId)).task!.agents.every(a => a.status !== "running" && a.status !== "idle"));
  } finally { await app.close(); await fx.cleanup(); }
});

for (const sameText of [false, true]) for (const phase of ["before-chapter", "before-owner"] as const) {
  test(`定稿故障 ${phase}，${sameText ? "相同" : "不同"}正文只由实际保存版本负责同步`, async () => {
    const fx = await openFixture(); fx.session.dispose();
    const options = { config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } }; let app = new LocalApp(options);
    try {
      const a = (await app.snapshot(fx.work.workId)).task!; await writeDraft(fx, app, a);
      const b = await app.createTask(a.workId, randomUUID()); await writeDraft(fx, app, b, sameText ? undefined : "旅人推开木门，阳光照亮庭院。");
      fx.faux.context.setResponses([fauxAssistantMessage("正文已保存，稍后处理。")]);
      await app.command({ ...a, kind:"finalize",draftId:"draft_1",fingerprint:(await app.draft(a,"draft_1")).fingerprint,confirmed:true,requestId:randomUUID() }); await waitFor(()=>!app.active,"A 定稿");
      const fingerprint = (await app.draft(b,"draft_1")).fingerprint;
      const rename = fs.renameSync;
      const fault = mock.method(fs,"renameSync",(from: fs.PathLike,to: fs.PathLike)=>{
        if (String(to).endsWith(phase === "before-chapter" ? "/canon/chapters/ch1.json" : "/sync-owners.json")) throw new Error("模拟持久化中断");
        return rename(from,to);
      }); syncBuiltinESMExports();
      try { await assert.rejects(app.command({...b,kind:"finalize",draftId:"draft_1",fingerprint,confirmed:true,requestId:randomUUID()}),/模拟持久化中断/); }
      finally { fault.mock.restore(); syncBuiltinESMExports(); }
      await waitFor(()=>!app.active,"失败后释放占用"); await app.close(); app = new LocalApp(options); await app.recover();
      const current = (await app.snapshot(a.workId,a.taskId)).task!;
      assert.equal(current.pendingSync[0]!.error,undefined);
      assert.equal(current.pendingSync[0]!.owner!.taskId,phase === "before-chapter" ? a.taskId : b.taskId);
      assert.equal((await app.draft(a,"draft_1")).finalized,phase === "before-chapter");
      assert.equal((await app.draft(b,"draft_1")).finalized,phase === "before-owner");
      const official = loadCanon(fx.work.workDir).chapters.get("ch1")!;
      assert.equal(JSON.parse(git(fx.work.workDir,["show","HEAD:canon/chapters/ch1.json"])).content,official.content);
      assert.equal(git(fx.work.workDir,["diff","HEAD","--","canon/chapters/ch1.json","canon/sync.json"]),"");
    } finally { await app.close(); await fx.cleanup(); }
  });
}

test("承接期间同任务消息不能绕过占用，另一个任务也不能并行开始",async()=>{
  const fx=await openFixture();fx.session.dispose();const app=new LocalApp({config:fx.config,modelRuntime:{runtime:fx.runtime,models:fx.hub.models}});
  try {
    const before=loadCanon(fx.work.workDir), after=cloneCanon(before);
    after.chapters.set("old",{schema_version:1,id:"old",title:"旧章",order:1,status:"finalized",content:"旅人推开木门。",summary:"",key_characters:[]});after.sync.pending_chapter_ids.push("old");await saveCanon(fx.work.workDir,before,after);
    const a=(await app.snapshot(fx.work.workId)).task!,b=await app.createTask(a.workId,randomUUID());
    const claim=app.command({...a,kind:"claim-sync",chapterId:"old",version:a.pendingSync[0]!.version,requestId:randomUUID()});
    await assert.rejects(app.command({...a,kind:"message",text:"承接未完成不能发送",requestId:randomUUID()}),/承接同步/);
    await assert.rejects(app.command({...b,kind:"message",text:"不能并行开始",requestId:randomUUID()}),/正在执行/);
    await claim; assert.equal(app.active,null);
  }finally{await app.close();await fx.cleanup();}
});

test("引用稿件的消息先发出时保留占用，不能再并发承接",async()=>{
  const fx=await openFixture();fx.session.dispose();const app=new LocalApp({config:fx.config,modelRuntime:{runtime:fx.runtime,models:fx.hub.models}});
  let release=()=>{};const gate=new Promise<void>(r=>{release=r;});
  try {
    const a=(await app.snapshot(fx.work.workId)).task!;await writeDraft(fx,app,a);
    const before=loadCanon(fx.work.workDir),after=cloneCanon(before);
    after.chapters.set("old",{schema_version:1,id:"old",title:"旧章",order:1,status:"finalized",content:"旅人推开木门。",summary:"",key_characters:[]});after.sync.pending_chapter_ids.push("old");await saveCanon(fx.work.workDir,before,after);
    const state=(await app.snapshot(a.workId,a.taskId)).task!,b=await app.createTask(a.workId,randomUUID());
    fx.faux.context.setResponses([async()=>{await gate;return fauxAssistantMessage("没有修改正文。");}]);
    const message=app.command({...a,kind:"message",text:"这版暂不修改",draftId:"draft_1",requestId:randomUUID()});
    await assert.rejects(app.command({...a,kind:"claim-sync",chapterId:"old",version:state.pendingSync[0]!.version,requestId:randomUUID()}),/正在执行/);
    await message;assert.equal(app.active!.taskId,a.taskId);
    await assert.rejects(app.command({...b,kind:"message",text:"不能并行",requestId:randomUUID()}),/正在执行/);
    release();await waitFor(()=>!app.active,"原消息完成");
  }finally{release();await app.close();await fx.cleanup();}
});

test("引用稿件消息紧接着停止时保留停止状态与作者停止标记",async()=>{
  const fx=await openFixture();fx.session.dispose();const app=new LocalApp({config:fx.config,modelRuntime:{runtime:fx.runtime,models:fx.hub.models}});
  let release=()=>{},entered=()=>{};const gate=new Promise<void>(r=>{release=r;}),reached=new Promise<void>(r=>{entered=r;});
  try {
    const a=(await app.snapshot(fx.work.workId)).task!;await writeDraft(fx,app,a);
    fx.faux.context.setResponses([async()=>{entered();await gate;return fauxAssistantMessage("结束。");}]);
    await app.command({...a,kind:"message",text:"等待我补充",requestId:randomUUID()});await reached;
    const message=app.command({...a,kind:"message",text:"引用第一版",draftId:"draft_1",requestId:randomUUID()});
    const stopping=app.command({...a,kind:"stop",requestId:randomUUID()});
    await assert.rejects(message,/停止/);
    assert.equal((await app.snapshot(a.workId,a.taskId)).task!.status,"stopping");
    release();await stopping;
    assert.equal((await app.snapshot(a.workId,a.taskId)).task!.status,"stopped");
    const page=JSON.parse(readFileSync(join(fx.work.workDir,"tasks",a.taskId,"page.json"),"utf8"));assert.equal(page.stoppedByAuthor,true);
  }finally{release();await app.close();await fx.cleanup();}
});

for (const sameText of [true,false]) test(`归属保存失败后不重启直接同步，${sameText?"相同":"不同"}正文仍保留新定稿身份`,async()=>{
  const fx=await openFixture();fx.session.dispose();const app=new LocalApp({config:fx.config,modelRuntime:{runtime:fx.runtime,models:fx.hub.models}});
  try {
    const a=(await app.snapshot(fx.work.workId)).task!;await writeDraft(fx,app,a);
    const b=await app.createTask(a.workId,randomUUID());await writeDraft(fx,app,b,sameText?undefined:"旅人推开木门，阳光照亮庭院。");
    fx.faux.context.setResponses([fauxAssistantMessage("等待同步。")]);
    await app.command({...a,kind:"finalize",draftId:"draft_1",fingerprint:(await app.draft(a,"draft_1")).fingerprint,confirmed:true,requestId:randomUUID()});await waitFor(()=>!app.active,"A 已定稿");
    const fingerprint=(await app.draft(b,"draft_1")).fingerprint;
    const rename=fs.renameSync,fault=mock.method(fs,"renameSync",(from:fs.PathLike,to:fs.PathLike)=>{if(String(to).endsWith('/sync-owners.json'))throw new Error('模拟归属保存失败');return rename(from,to);});syncBuiltinESMExports();
    try{await assert.rejects(app.command({...b,kind:"finalize",draftId:"draft_1",fingerprint,confirmed:true,requestId:randomUUID()}),/模拟归属保存失败/);}finally{fault.mock.restore();syncBuiltinESMExports();}
    await waitFor(()=>!app.active,"定稿失败释放占用");
    const version=(await app.snapshot(b.workId,b.taskId)).task!.pendingSync[0]!.version;
    fx.faux.sync_checker.setResponses([fauxAssistantMessage([fauxToolCall("save_sync_check",{verdicts:[{change_id:"summary",verdict:"supported",reason:"正文行动",conflicting_ids:[]}]})]),fauxAssistantMessage("核对完成。")]);
    fx.faux.context.setResponses([fauxAssistantMessage([fauxToolCall("save_sync_proposal",summaryProposal)]),fauxAssistantMessage([fauxToolCall("spawn_subagent",{role:"sync_checker",proposal_id:"proposal_1", task: "完成本次安排"})]),fauxAssistantMessage("等待核对。"),fauxAssistantMessage([fauxToolCall("apply_sync",{proposal_id:"proposal_1",change_ids:["summary"]})]),fauxAssistantMessage("同步完成。")]);
    await app.command({...b,kind:"continue",requestId:randomUUID()});await waitFor(()=>!app.active,"不重启完成同步");
    const result=(await app.snapshot(b.workId,b.taskId)).task!;
    assert.deepEqual(result.pendingSync,[]);assert.equal(result.drafts[0]!.finalized,true);assert.equal((await app.draft(a,"draft_1")).finalized,false);
    assert.equal(loadRegistry(taskLayout(fx.work,b.taskId)).finalizations.at(-1)!.event_id,version);
  }finally{await app.close();await fx.cleanup();}
});

test("正文已保存但待同步标记持续写入失败时仍阻止新写作，恢复存储后原地修复",async()=>{
  const fx=await openFixture();fx.session.dispose();const app=new LocalApp({config:fx.config,modelRuntime:{runtime:fx.runtime,models:fx.hub.models}});
  try {
    const a=(await app.snapshot(fx.work.workId)).task!;await writeDraft(fx,app,a);const b=await app.createTask(a.workId,randomUUID());
    const fingerprint=(await app.draft(a,"draft_1")).fingerprint,rename=fsPromises.rename;
    const fault=mock.method(fsPromises,"rename",async(from:fs.PathLike,to:fs.PathLike)=>{if(String(to).endsWith('/canon/sync.json'))throw new Error('模拟待同步标记保存失败');return rename(from,to);});syncBuiltinESMExports();
    try{
      await assert.rejects(app.command({...a,kind:"finalize",draftId:"draft_1",fingerprint,confirmed:true,requestId:randomUUID()}),/待同步标记保存失败/);
      await waitFor(()=>!app.active,"持久化失败结束");
      const partial=(await app.snapshot(a.workId,a.taskId)).task!;
      assert.equal(partial.drafts[0]!.finalized,true);assert.deepEqual(partial.pendingChapters,["ch1"]);assert.match(partial.pendingSync[0]!.error!,/尚未完整保存/);
      await assert.rejects(app.command({...b,kind:"message",text:"写下一章",requestId:randomUUID()}),/待同步标记保存失败/);
      await waitFor(()=>!app.active,"拒绝新任务");
    }finally{fault.mock.restore();syncBuiltinESMExports();}
    const repaired=(await app.snapshot(a.workId,a.taskId)).task!;
    assert.deepEqual(repaired.pendingChapters,["ch1"]);assert.equal(repaired.pendingSync[0]!.owner!.taskId,a.taskId);assert.equal(repaired.pendingSync[0]!.error,undefined);
    assert.deepEqual(loadCanon(fx.work.workDir).sync.pending_chapter_ids,["ch1"]);
    assert.equal(git(fx.work.workDir,["diff","HEAD","--","canon/chapters/ch1.json","canon/sync.json"]),"");
  }finally{await app.close();await fx.cleanup();}
});
