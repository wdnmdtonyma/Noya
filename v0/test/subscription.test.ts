import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { SettingsManager } from "@earendil-works/pi-coding-agent";
import { openWritingSession } from "../src/app.ts";
import { writeAudit } from "../src/audit.ts";
import { loadRegistry } from "../src/layout.ts";
import { createModelRuntime, resolveRoleModels } from "../src/models.ts";
import { liveMessages } from "../src/transcript.ts";
import { openFixture, toolTexts, waitFor, type Fixture } from "./harness.ts";

type Item = Record<string, unknown>;
const token = "oauth-test-sentinel";

async function authorize(fx: Fixture): Promise<void> {
  await writeFile(join(fx.work.agentDir, "auth.json"), JSON.stringify({
    openai: { type: "oauth", access: token, refresh: "refresh-test-sentinel", clientId: "test-client", scopes: ["chatgpt.tokens.use.direct"], expires: Date.now() + 3600000 },
  }));
  await fx.runtime.refresh({ allowNetwork: false });
}

function call(name: string, args: Item, id = "roundtrip"): Item {
  return { type: "function_call", id: `fc_${id}`, call_id: `call_${id}`, name, namespace: "noya", arguments: JSON.stringify(args), status: "completed" };
}

function completed(items: Item[] = []): Item[] {
  return [
    ...items.flatMap((item, output_index) => [
      { type: "response.output_item.added", output_index, item },
      { type: "response.output_item.done", output_index, item },
    ]),
    { type: "response.completed", response: { id: "resp_test", status: "completed", output: items, usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } } },
  ];
}

function mockResponses(t: TestContext, responses: Array<Item[] | ((body: Item) => Item[])> | ((body: Item) => Item[])): Item[] {
  const requests: Item[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(input), "https://api.openai.com/v1/responses");
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${token}`);
    const body = JSON.parse(String(init?.body)) as Item;
    requests.push(body);
    const response = typeof responses === "function" ? responses : responses.shift();
    assert.ok(response, "每条请求必须有显式模拟响应");
    const events = typeof response === "function" ? response(body) : response;
    return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
  });
  return requests;
}

test("未登录仍能打开 OpenAI 写作任务，环境 API key 和旧 Codex 凭证不能补位", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("不应发起请求"); });
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "sk-paid-sentinel";
  t.after(() => {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  });
  const fx = await openFixture({ provider: "openai" });
  try {
    await writeFile(join(fx.work.agentDir, "auth.json"), JSON.stringify({
      "openai-codex": { type: "oauth", access: "legacy-sentinel", refresh: "legacy-refresh", expires: Date.now() + 3600000 },
    }));
    assert.equal(fx.session.model?.provider, "openai");
    assert.equal(fx.session.model?.id, "gpt-6.1-sol");
    await assert.rejects(fx.session.prompt("测试订阅"), /login/);
    await assert.rejects(fx.runtime.getAuth("openai"), /login openai/);
    await writeFile(join(fx.work.agentDir, "auth.json"), JSON.stringify({ openai: { type: "api_key", key: "sk-stored-sentinel" } }));
    await fx.runtime.refresh({ allowNetwork: false });
    await assert.rejects(fx.runtime.getAuth("openai"), /login openai/);
    assert.equal(fetch.mock.calls.length, 0);
  } finally {
    await fx.cleanup();
  }
});

test("Pi 登录使用写作任务的运行时和持久化安装标识，重建运行时复用保存的 OAuth", async (t) => {
  const fx = await openFixture({ provider: "openai" });
  try {
    const settings = SettingsManager.create(fx.work.workDir, fx.work.agentDir);
    const deviceId = settings.getOrCreateDeviceId();
    let state = "";
    let exchanges = 0;
    t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
      assert.equal(String(input), "https://auth.openai.com/api/accounts/oauth/token");
      const params = new URLSearchParams(String(init?.body));
      assert.equal(params.get("client_id"), "test-issued-client");
      exchanges++;
      return Response.json({ access_token: token, refresh_token: "refresh-test-sentinel", expires_in: 3600, scope: "chatgpt.tokens.use.direct", id_token: "id-test-sentinel" });
    });
    await fx.runtime.login("openai", "oauth", {
      signal: new AbortController().signal,
      notify: (event) => {
        if (event.type !== "auth_url") return;
        const url = new URL(event.url);
        assert.equal(url.searchParams.get("agent_name_hint"), "Pi");
        assert.equal(url.searchParams.get("ext_agent_host_id"), `urn:uuid:${deviceId}`);
        state = url.searchParams.get("state")!;
      },
      prompt: async () => `http://127.0.0.1:1455/auth/callback?code=test-code&client_id=test-issued-client&state=${state}`,
    }, { getDeviceId: () => settings.getOrCreateDeviceId() });
    const restarted = await createModelRuntime(fx.work.agentDir);
    await restarted.refresh({ allowNetwork: false });
    assert.equal((await restarted.getAuth("openai"))?.auth.apiKey, token);
    assert.equal(exchanges, 1);
    assert.equal(SettingsManager.create(fx.work.workDir, fx.work.agentDir).getOrCreateDeviceId(), deviceId);
    assert.doesNotMatch(await readFile(fx.session.sessionFile!, "utf8").catch(() => ""), /oauth-test-sentinel|test-code/);
  } finally { await fx.cleanup(); }
});

test("四角色共用订阅完成方案、短稿、独立检查、作者定稿和同步，失败不丢旧稿，重启复用凭证", async (t) => {
  const fx = await openFixture({ provider: "openai" });
  try {
    await authorize(fx);
    const brief = { schema_version: 1, id: "brief-1", chapter_id: "ch1", mode: "write_chapter", intent: "让林凡停在矿洞口", requirements: ["林凡停在洞口"], constraints: [], ending: null, creative_scope: [], leave_open: [] };
    const pack = "## 未知\n来源：无\n\n矿洞和林凡的身份尚未确认。\n";
    const body = "# 矿洞口\n\n林凡停在矿洞口，没有进去。\n";
    const scripts: Record<string, Item[][]> = {
      context: [],
      writer: [completed([call("write", { path: "plan.md", content: "# 方案\n\n林凡停在洞口。" })]), completed([call("submit_plan", {})]), completed()],
      reviewer: [completed([call("save_review", { review: { schema_version: 1, chapter_id: "ch1", checks: { requirements: "passed", character_motivation: "passed", possessions_and_abilities: "passed", ability_rules: "passed" }, feedback: [] } })]), completed()],
      sync_checker: [completed([call("save_sync_check", { verdicts: [{ change_id: "sum", verdict: "supported", reason: "正文写林凡停在矿洞口", conflicting_ids: [] }] })]), completed()],
    };
    const seen: Record<string, Item[]> = { context: [], writer: [], reviewer: [], sync_checker: [] };
    const requests = mockResponses(t, (request) => {
      const tools = (request.tools as Array<{ tools: Item[] }>)[0].tools;
      const names = tools.map((tool) => tool.name);
      const role = names.includes("submit_plan") ? "writer" : names.includes("save_review") ? "reviewer" : names.includes("save_sync_check") ? "sync_checker" : "context";
      seen[role].push(request);
      return scripts[role].shift() ?? completed();
    });
    const turn = async (message: string, name?: string, args?: Item) => {
      if (name) scripts.context.push(completed([call(name, args!)]));
      await fx.session.prompt(message);
      await fx.session.waitForIdle();
    };
    const finished = async (id: string) => {
      await waitFor(() => !!loadRegistry(fx.hub.task).subagents.find((agent) => agent.id === id)?.rounds.at(-1)?.endedAt, id);
      await fx.session.waitForIdle();
    };
    await turn("AUTHOR_REJECTED_DIRECTION_SENTINEL 已废弃，只采用 brief 的方向", "save_package", { brief, pack });
    assert.equal(toolTexts(fx.session, "save_package").at(-1), "package_1");
    await turn("先提出方案", "spawn_subagent", { role: "writer", package_id: "package_1" });
    await finished("writer-1");
    assert.match(JSON.stringify(seen.writer[0].input), /Writing Brief/);
    assert.doesNotMatch(JSON.stringify(seen.writer[0].input), /AUTHOR_REJECTED_DIRECTION_SENTINEL/);
    await turn("检查方案", "read", { path: `tasks/${fx.hub.taskId}/artifacts/plan_1.md` });
    scripts.writer.push(completed([call("write", { path: "draft.md", content: body })]), completed([call("submit_draft", {})]), completed());
    await turn("按方案写短稿", "send_message", { agent_id: "writer-1", message: "方案符合要求，请写正文" });
    await finished("writer-1");
    await turn("独立检查", "spawn_subagent", { role: "reviewer", draft_id: "draft_1" });
    await finished("reviewer-1");
    assert.doesNotMatch(JSON.stringify(seen.reviewer[0].input), /AUTHOR_REJECTED_DIRECTION_SENTINEL/);
    assert.equal(loadRegistry(fx.hub.task).finalizations.length, 0);
    await turn("/finalize draft_1");
    const proposal = { chapter_id: "ch1", changes: [{ id: "sum", change: { type: "chapter_meta", chapter_id: "ch1", summary: "林凡停在矿洞口。", key_characters: [] }, evidence: ["林凡停在矿洞口"], rationale: "正文依据" }] };
    await turn("根据定稿同步", "save_sync_proposal", proposal);
    await turn("核对依据", "spawn_subagent", { role: "sync_checker", proposal_id: "proposal_1" });
    await finished("sync_checker-1");
    assert.match(JSON.stringify(seen.sync_checker[0].input), /定稿正文/);
    await turn("写入通过核对的摘要", "apply_sync", { proposal_id: "proposal_1", change_ids: ["sum"] });
    const chapter = JSON.parse(await readFile(join(fx.work.workDir, "canon/chapters/ch1.json"), "utf8"));
    assert.equal(chapter.content.trim(), "林凡停在矿洞口，没有进去。");
    assert.equal(chapter.summary, "林凡停在矿洞口。");
    assert.deepEqual(JSON.parse(await readFile(join(fx.work.workDir, "canon/sync.json"), "utf8")).pending_chapter_ids, []);
    const interrupted = completed([call("write", { path: "draft.md", content: "不应覆盖旧稿" })]).slice(0, -1);
    interrupted.push({ type: "response.incomplete", response: { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } } });
    scripts.writer.push(interrupted);
    await turn("修改过程中断流", "send_message", { agent_id: "writer-1", message: "再检查一下措辞" });
    await finished("writer-1");
    assert.equal(loadRegistry(fx.hub.task).subagents[0].rounds.at(-1)?.outcome, "failed");
    assert.equal(await readFile(join(fx.hub.task.agentsDir, "writer-1/draft.md"), "utf8"), body);
    for (const role of Object.keys(seen)) assert.ok(seen[role].length > 0, role);
    for (const request of requests) assert.equal(request.model, "gpt-6.1-sol");
    const audit = await readFile(await writeAudit(fx.config, fx.work.workDir, fx.hub.taskId), "utf8");
    assert.doesNotMatch(audit, /费用 [\d.]|oauth-test-sentinel|refresh-test-sentinel/);
    assert.match(audit, /订阅/);
    fx.session.dispose();
    const restarted = await resolveRoleModels(fx.config, fx.work.agentDir);
    const resumed = await openWritingSession({ work: fx.work, config: fx.config, ...restarted, resume: true });
    try {
      await resumed.runtimeHost.session.prompt("重启后继续");
      assert.equal(resumed.hub.taskId, fx.hub.taskId);
      assert.equal(loadRegistry(resumed.hub.task).finalizations[0].draft_id, "draft_1");
      assert.match(JSON.stringify(requests.at(-1)?.input), /AUTHOR_REJECTED_DIRECTION_SENTINEL/);
      assert.match(JSON.stringify(requests.at(-1)?.input), /call_roundtrip/);
    } finally { resumed.runtimeHost.session.dispose(); }
  } finally { await fx.cleanup(); }
});

for (const failure of ["incomplete", "disconnected", "unfinished", "failed", "usage_limit", "usage_unavailable"] as const) {
  test(`${failure} 流中已收到工具也不执行，助手记录失败且旧产物保留`, async (t) => {
    const fx = await openFixture({ provider: "openai" });
    try {
      await authorize(fx);
      await writeFile(join(fx.hub.task.taskDir, "visible.md"), "KEEP_EXISTING_ARTIFACT\n");
      const events = completed([call("read", { path: `tasks/${fx.hub.taskId}/visible.md` })]).slice(0, -1);
      if (failure === "unfinished") {
        events.splice(1, 1);
        events.push({ type: "response.completed", response: { status: "completed", output: [] } });
      }
      if (failure === "incomplete") events.push({ type: "response.incomplete", response: { status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [] } });
      if (failure === "failed") events.push({ type: "response.failed", response: { status: "failed", error: { code: "server_error", message: "test failure" } } });
      if (failure.startsWith("usage_")) events.push({ type: "response.failed", response: { status: "failed", error: { code: failure === "usage_limit" ? "subscription_sharing_usage_limit_exceeded" : "subscription_sharing_usage_unavailable", message: "quota test" } } });
      mockResponses(t, [events]);
      await fx.session.prompt("失败轮次");
      const last = liveMessages(fx.session).at(-1);
      assert.equal(last?.stopReason, "error");
      assert.match(String(last?.errorMessage), failure === "incomplete" ? /incomplete/ : failure === "disconnected" ? /terminal/ : failure === "unfinished" ? /unfinished tool/ : failure === "failed" ? /server_error/ : /subscription_sharing_usage/);
      assert.equal(toolTexts(fx.session, "read").length, 0);
      assert.equal(await readFile(join(fx.hub.task.taskDir, "visible.md"), "utf8"), "KEEP_EXISTING_ARTIFACT\n");
    } finally { await fx.cleanup(); }
  });
}

test("未知模型按 OpenAI provider 注册，thinking 不支持时明确拒绝", async () => {
  const fx = await openFixture();
  try {
    const config = structuredClone(fx.config);
    config.roles.context = { provider: "openai", model: "noya-test-model", thinking: "high", contextWindow: 4096, maxOutput: 256, thinkingLevels: ["high"] };
    const resolved = await resolveRoleModels(config, fx.work.agentDir);
    assert.equal(resolved.models.context.model.provider, "openai");
    assert.equal(resolved.models.context.model.id, "noya-test-model");
    assert.equal(resolved.models.context.model.contextWindow, 4096);
    assert.equal(resolved.runtime.getModel("deepseek", "noya-test-model"), undefined);
    config.roles.context.thinking = "medium";
    await assert.rejects(resolveRoleModels(config, fx.work.agentDir), /不会自动/);
  } finally { await fx.cleanup(); }
});

test("已登录时显式 API key 也不能替换订阅凭证", async (t) => {
  const fx = await openFixture({ provider: "openai" });
  try {
    await authorize(fx);
    const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("不应使用付费密钥发请求"); });
    const result = await fx.runtime.completeSimple(fx.hub.models.context.model, { messages: [{ role: "user", content: "hello", timestamp: Date.now() }] }, { apiKey: "sk-paid-sentinel" });
    assert.equal(result.stopReason, "error");
    assert.match(result.errorMessage ?? "", /订阅/);
    assert.equal(fetch.mock.calls.length, 0);
  } finally { await fx.cleanup(); }
});

test("订阅声明使用稳定 namespace，真实工具执行后 call ID 和 namespace 随续写历史重放", async (t) => {
  const fx = await openFixture({ provider: "openai" });
  try {
    await authorize(fx);
    await writeFile(join(fx.hub.task.taskDir, "visible.md"), "TOOL_RESULT_SENTINEL\n");
    const requests = mockResponses(t, [completed([call("read", { path: `tasks/${fx.hub.taskId}/visible.md` })]), completed(), completed()]);
    await fx.session.prompt("读 visible.md，AUTHOR_HISTORY_SENTINEL");
    assert.match(toolTexts(fx.session, "read").at(-1) ?? "", /TOOL_RESULT_SENTINEL/);
    assert.deepEqual((requests[0].tools as Item[]).map((tool) => tool.type), ["namespace"]);
    assert.equal((requests[0].tools as Item[])[0].name, "noya");
    assert.equal(requests[0].store, false);
    assert.equal(requests[0].stream, true);
    assert.equal(requests[0].model, "gpt-6.1-sol");
    assert.equal((requests[0].reasoning as Item).effort, "low");
    assert.ok((requests[0].input as Item[]).some((item) => item.role === "developer"));
    assert.equal(requests[0].max_output_tokens, undefined);
    assert.ok((requests[1].input as Item[]).some((item) => item.type === "function_call" && item.call_id === "call_roundtrip" && item.namespace === "noya"));
    assert.ok((requests[1].input as Item[]).some((item) => item.type === "function_call_output" && item.call_id === "call_roundtrip" && String(item.output).includes("TOOL_RESULT_SENTINEL")));
    fx.session.dispose();
    const resumed = await openWritingSession({ work: fx.work, config: fx.config, runtime: fx.runtime, models: fx.hub.models, resume: true });
    try {
      await resumed.runtimeHost.session.prompt("继续读过的资料");
      assert.match(JSON.stringify(requests[2].input), /AUTHOR_HISTORY_SENTINEL/);
      assert.match(JSON.stringify(requests[2].input), /TOOL_RESULT_SENTINEL/);
      assert.equal(requests[2].previous_response_id, undefined);
    } finally { resumed.runtimeHost.session.dispose(); }
    assert.doesNotMatch(await readFile(fx.session.sessionFile!, "utf8"), /oauth-test-sentinel|refresh-test-sentinel/);
  } finally { await fx.cleanup(); }
});
