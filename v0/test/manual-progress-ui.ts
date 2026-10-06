/** Scripted local server for the subagent-progress browser walkthrough. */
import { randomUUID } from "node:crypto";
import { LocalApp } from "../src/local-app.ts";
import { startLocalServer } from "../src/local-server.ts";
import { fauxAssistantMessage, fauxToolCall, openFixture, waitFor } from "./harness.ts";

const brief = { schema_version: 1, id: "b1", chapter_id: "ch1", mode: "write_chapter", intent: "雨夜开门", requirements: [], constraints: [], ending: null, creative_scope: [], leave_open: [] };
const pack = "## 未知\n来源：无\n人物来历未知。\n";
const fx = await openFixture();
fx.session.dispose();
const app = new LocalApp({ config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } });
const task = (await app.snapshot(fx.work.workId)).task!;
fx.faux.writer.setResponses([
  fauxAssistantMessage([fauxToolCall("write", { path: "plan.md", content: "# 方案\n雨夜开门。" })]),
  fauxAssistantMessage([fauxToolCall("submit_plan", {})]),
  fauxAssistantMessage([fauxToolCall("write", { path: "draft.md", content: "# 雨夜\n\n旅人推开木门，雨水落在门槛上。\n" })]),
  fauxAssistantMessage([fauxToolCall("submit_draft", {})]),
  fauxAssistantMessage("写好了。"),
]);
fx.faux.context.setResponses([
  fauxAssistantMessage([fauxToolCall("read", { path: "canon/world.json" })]),
  fauxAssistantMessage([fauxToolCall("save_package", { brief, pack })]),
  fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "writer", package_id: "package_1", task: "写雨夜开门的第一段" })]),
  fauxAssistantMessage("正在写。"),
  fauxAssistantMessage("第 1 版已保存。满意就可以定稿，或者告诉我哪里要改。"),
]);
await app.command({ ...task, kind: "message", text: "写雨夜开门", requestId: randomUUID() });
await waitFor(() => !app.active, "样例写完");
fx.faux.context.setResponses([async () => {
  await new Promise(resolve => setTimeout(resolve, 300_000));
  return fauxAssistantMessage("补充已记下。");
}]);
void app.command({ ...task, kind: "message", text: "门槛上再添一盏灯", requestId: randomUUID() });
await waitFor(() => app.active?.taskId === task.taskId, "第二轮开始");
const server = await startLocalServer(app, { port: 0 });
console.log(JSON.stringify({ url: server.url, work: task.workId, task: task.taskId }));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { void server.close().then(() => process.exit(0)); });
