/** Interactive acceptance with real LocalApp, sessions, tools and storage; scripted model only. */
import { cloneCanon, loadCanon, saveCanon } from "../src/canon.ts";
import { LocalApp } from "../src/local-app.ts";
import { startLocalServer } from "../src/local-server.ts";
import { fauxAssistantMessage, openFixture } from "./harness.ts";
const fx = await openFixture(); fx.session.dispose();
fx.faux.context.setResponses(Array.from({ length: 120 }, (_, i) => async () => {
  await new Promise(resolve => setTimeout(resolve, 1800));
  return fauxAssistantMessage(i % 3 === 0 ? "我们可以从一场雨开始。你希望来客带来一个秘密，还是解开原有的疑问？\n\n这个想法还留在当前任务里，等你决定。" : "我记下了。我们可以继续讨论这一条思路，等你决定再开始写作。");
}));
if (process.env.NOYA_LEGACY === "1") {
  const before = loadCanon(fx.work.workDir), after = cloneCanon(before);
  after.chapters.set("legacy", { schema_version: 1, id: "legacy", title: "旧日来信", order: 1, status: "finalized", content: "旅人在钟楼前停下，门缝透出灯光。", summary: "", key_characters: [] });
  after.sync.pending_chapter_ids.push("legacy"); await saveCanon(fx.work.workDir, before, after);
}
const app = new LocalApp({ config: fx.config, modelRuntime: { runtime: fx.runtime, models: fx.hub.models } });
const a = (await app.snapshot(fx.work.workId)).task!;
const b = await app.createTask(a.workId, "browser-second-task");
const other = await app.create();
const server = await startLocalServer(app, { port: 0 });
console.log(JSON.stringify({ url: server.url, work: a.workId, a: a.taskId, b: b.taskId, other: other.workId, root: fx.root }));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { void server.close().then(() => process.exit(0)); });
