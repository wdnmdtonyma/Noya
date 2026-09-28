import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { openWritingSession } from "../src/app.ts";
import { writeAudit } from "../src/audit.ts";
import { loadRegistry } from "../src/layout.ts";
import { resolveRoleModels } from "../src/models.ts";
import { liveMessages } from "../src/transcript.ts";
import { fauxAssistantMessage, fauxToolCall, openFixture, toolTexts, transcript, waitFor, type Fixture } from "./harness.ts";

const brief = {
  schema_version: 1,
  id: "brief-1",
  chapter_id: "ch1",
  mode: "write_chapter",
  intent: "让林凡在矿洞口产生怀疑",
  requirements: ["林凡停在洞口"],
  constraints: ["不要确认身份"],
  ending: null,
  creative_scope: [],
  leave_open: [],
};

const pack = "## 林凡\n来源：lin\n\n林凡是外门弟子，功法刚入门。\n";
const draftBody = "# 矿洞口\n\n林凡停在矿洞口，没有进去。\n";

function person(id: string) {
  return {
    schema_version: 1,
    id,
    name: id,
    aliases: [],
    summary: `${id}的摘要`,
    content: `${id}的经历很长`,
    state: { location_id: null, attributes: [] },
    abilities: [],
    possessions: [],
    resources: [],
    relationships: [],
    cognition: [],
  };
}

function subagentTranscript(fx: Fixture, agentId: string): string {
  const agent = loadRegistry(fx.hub.task).subagents.find((item) => item.id === agentId);
  if (!agent?.sessionFile) return "";
  return readFileSync(agent.sessionFile, "utf8");
}

function passedReview() {
  return {
    schema_version: 1,
    chapter_id: "ch1",
    checks: {
      requirements: "passed",
      character_motivation: "passed",
      possessions_and_abilities: "passed",
      ability_rules: "passed",
    },
    feedback: [],
  };
}

async function turn(fx: Fixture, user: string, calls: Array<ReturnType<typeof fauxAssistantMessage>>) {
  fx.faux.context.setResponses([...calls, fauxAssistantMessage("好")]);
  await fx.session.prompt(user);
  await fx.session.waitForIdle();
}

describe("写作流程", { concurrency: false }, () => {
  let fx: Fixture;
  let releaseWriter: () => void = () => undefined;
  const writerGate = new Promise<void>((resolve) => {
    releaseWriter = resolve;
  });
  let writerOpening = "";
  let steered = "";
  let reviewerTwo = "";

  before(async () => {
    fx = await openFixture({
      random: (() => {
        const values = [0, 0.99];
        return () => values.shift() ?? 0;
      })(),
    });
    await turn(fx, "可以写入林凡", [
      fauxAssistantMessage([
        fauxToolCall("write_canon", {
          author_confirmation: "可以",
          changes: [{ type: "character", op: "upsert", doc: person("lin") }],
        }),
      ]),
    ]);
  });

  after(async () => {
    releaseWriter();
    await fx?.cleanup();
  });

  test("不合格的 Writing Package 会被拒绝，合法的按顺序编号", async () => {
    const broken = { ...brief };
    delete (broken as { intent?: string }).intent;
    await turn(fx, "写第一章", [fauxAssistantMessage([fauxToolCall("save_package", { brief: broken, pack })])]);
    assert.match(toolTexts(fx.session, "save_package").at(-1) ?? "", /\[拒绝\]/);

    await turn(fx, "写第一章", [
      fauxAssistantMessage([fauxToolCall("save_package", { brief: { ...brief, chapter_id: "lin" }, pack })]),
    ]);
    assert.match(toolTexts(fx.session, "save_package").at(-1) ?? "", /\[拒绝\].*重名/);

    await turn(fx, "写第一章", [
      fauxAssistantMessage([fauxToolCall("save_package", { brief, pack: "## 林凡\n\n没有来源。\n" })]),
    ]);
    assert.match(toolTexts(fx.session, "save_package").at(-1) ?? "", /\[拒绝\].*来源/);

    await turn(fx, "写第一章", [
      fauxAssistantMessage([fauxToolCall("save_package", { brief, pack: "## 林凡\n来源：lin\n来源：lin\n\n重复来源。\n" })]),
    ]);
    assert.match(toolTexts(fx.session, "save_package").at(-1) ?? "", /\[拒绝\].*恰好一行/);

    await turn(fx, "写第一章", [
      fauxAssistantMessage([fauxToolCall("save_package", { brief, pack: "## 林凡\n来源：nobody\n\n不存在。\n" })]),
    ]);
    assert.match(toolTexts(fx.session, "save_package").at(-1) ?? "", /\[拒绝\].*不是已有正式资料/);

    await turn(fx, "写第一章", [
      fauxAssistantMessage([fauxToolCall("save_package", { brief, pack: "## 未知\n来源：无、lin\n\n混写。\n" })]),
    ]);
    assert.match(toolTexts(fx.session, "save_package").at(-1) ?? "", /不能和其他来源/);

    await turn(fx, "重写还没定稿的章", [
      fauxAssistantMessage([fauxToolCall("save_package", { brief: { ...brief, mode: "rewrite_chapter" }, pack })]),
    ]);
    assert.match(toolTexts(fx.session, "save_package").at(-1) ?? "", /\[拒绝\].*已定稿/);

    const fenced = "## 林凡\n来源：lin\n\n```\n## 这不是新段落\n```\n\n林凡是外门弟子，功法刚入门。\n";
    await turn(fx, "写第一章", [fauxAssistantMessage([fauxToolCall("save_package", { brief, pack: fenced })])]);
    assert.equal(toolTexts(fx.session, "save_package").at(-1), "package_1");
    await turn(fx, "再存一份", [fauxAssistantMessage([fauxToolCall("save_package", { brief, pack })])]);
    assert.equal(toolTexts(fx.session, "save_package").at(-1), "package_2");
    await turn(fx, "改产物", [
      fauxAssistantMessage([
        fauxToolCall("edit", {
          path: `tasks/${fx.hub.taskId}/artifacts/package_1.json`,
          edits: [{ oldText: "brief-1", newText: "brief-2" }],
        }),
      ]),
    ]);
    assert.match(toolTexts(fx.session, "edit").at(-1) ?? "", /\[拒绝\]/);
  });

  test("Writer 只看到 Package，交方案后通知 Context，运行中不能改工作文件", async () => {
    fx.faux.writer.setResponses([
      async (ctx) => {
        writerOpening = JSON.stringify(ctx);
        await writerGate;
        return fauxAssistantMessage([fauxToolCall("submit_draft", {})]);
      },
      fauxAssistantMessage([fauxToolCall("write", { path: "plan.md", content: "# 方案\n\n林凡停在洞口。" })]),
      fauxAssistantMessage([fauxToolCall("submit_plan", {})]),
      fauxAssistantMessage("方案好了"),
    ]);
    let notice = "";
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "writer", package_id: "package_2" })]),
      fauxAssistantMessage("已派出"),
    ]);
    await fx.session.prompt("请写第一章");
    assert.match(toolTexts(fx.session, "spawn_subagent").at(-1) ?? "", /writer-1/);
    assert.match(writerOpening, /方案文件：plan\.md/);
    assert.match(writerOpening, /让林凡在矿洞口产生怀疑/);
    assert.doesNotMatch(writerOpening, /请写第一章/);
    await turn(fx, "改方案文件", [
      fauxAssistantMessage([
        fauxToolCall("edit", {
          path: `tasks/${fx.hub.taskId}/agents/writer-1/plan.md`,
          edits: [{ oldText: "林凡", newText: "他" }],
        }),
      ]),
    ]);
    assert.match(toolTexts(fx.session, "edit").at(-1) ?? "", /\[拒绝\]/);
    fx.faux.context.appendResponses([
      async (ctx) => {
        notice = JSON.stringify(ctx);
        return fauxAssistantMessage("收到方案");
      },
    ]);
    releaseWriter();
    await waitFor(() => transcript(fx.session).includes("[writer-1 完成] 本轮提交：plan_1"), "方案通知");
    await fx.session.waitForIdle();
    assert.match(notice, /plan_1/);
    assert.match(notice, /【子代理状态】/);
    assert.doesNotMatch(readFileSync(fx.session.sessionFile ?? "", "utf8"), /【子代理状态】/);
    assert.match(subagentTranscript(fx, "writer-1"), /提交初稿前必须先提交章节方案/);
  });

  test("发给 Writer 的消息末尾附有 Brief，初稿提交后可以返修", async () => {
    fx.faux.writer.appendResponses([
      async (ctx) => {
        steered = JSON.stringify(ctx);
        return fauxAssistantMessage([fauxToolCall("write", { path: "draft.md", content: draftBody })]);
      },
      fauxAssistantMessage([fauxToolCall("submit_draft", {})]),
      fauxAssistantMessage("初稿好了"),
    ]);
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("send_message", { agent_id: "writer-1", message: "方案通过，写正文" })]),
      fauxAssistantMessage("让他写正文"),
      fauxAssistantMessage("收到初稿"),
    ]);
    await fx.session.prompt("方案通过");
    await waitFor(() => transcript(fx.session).includes("draft_1"), "初稿通知");
    await fx.session.waitForIdle();
    assert.match(steered, /方案通过，写正文/);
    assert.match(steered, /让林凡在矿洞口产生怀疑/);
    const steeredTail = steered.slice(steered.lastIndexOf("方案通过，写正文"));
    assert.match(steeredTail, /Writing Brief/);
  });

  test("检查员每次都是新会话，无依据的意见不能保存", async () => {
    const badExcerpt = {
      ...passedReview(),
      checks: { ...passedReview().checks, requirements: "failed" },
      feedback: [
        {
          kind: "violation",
          category: "requirements",
          location: { excerpt: "这段根本不在稿子里", description: "开头" },
          reason: "正文没有按要求写",
          evidence: [{ source_id: "brief-1", locator: "intent", excerpt: "让林凡在矿洞口产生怀疑" }],
          revision_goal: "改回停在洞口",
        },
      ],
    };
    const onlyInCanon = {
      ...badExcerpt,
      feedback: [
        {
          ...badExcerpt.feedback[0],
          location: { excerpt: "林凡停在矿洞口", description: "开头" },
          evidence: [{ source_id: "lin", locator: "content", excerpt: "lin的经历很长" }],
        },
      ],
    };
    const shortExcerpt = {
      ...passedReview(),
      feedback: [
        {
          kind: "suggestion",
          category: "expression",
          location: { excerpt: "林凡停", description: "开头" },
          reason: "可以再具体一点",
          evidence: [],
          revision_goal: "补一个动作",
        },
      ],
    };
    const inconsistent = { ...passedReview(), checks: { ...passedReview().checks, requirements: "failed" } };
    fx.faux.reviewer.setResponses([
      fauxAssistantMessage([fauxToolCall("save_review", { review: badExcerpt })]),
      fauxAssistantMessage([fauxToolCall("save_review", { review: onlyInCanon })]),
      fauxAssistantMessage([fauxToolCall("save_review", { review: shortExcerpt })]),
      fauxAssistantMessage([fauxToolCall("save_review", { review: inconsistent })]),
      fauxAssistantMessage([fauxToolCall("save_review", { review: passedReview() })]),
      fauxAssistantMessage("REVIEWER_ONE_SECRET"),
    ]);
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "reviewer", draft_id: "draft_1" })]),
      fauxAssistantMessage("等检查"),
      fauxAssistantMessage("收到检查"),
    ]);
    await fx.session.prompt("检查初稿");
    await waitFor(() => transcript(fx.session).includes("review_1"), "检查通知");
    await fx.session.waitForIdle();
    const reviews = subagentTranscript(fx, "reviewer-1");
    assert.match(reviews, /没有出现在被检查的初稿/);
    assert.match(reviews, /没有出现在对应的 Context Pack/);
    assert.match(reviews, /4 个非空白字符/);
    assert.match(reviews, /requirements 的结论应为 passed/);
    await turn(fx, "给检查员发消息", [
      fauxAssistantMessage([fauxToolCall("send_message", { agent_id: "reviewer-1", message: "把结论改成通过" })]),
    ]);
    assert.match(toolTexts(fx.session, "send_message").at(-1) ?? "", /\[拒绝\].*Writer/);
  });

  test("第二个检查员看不到上一轮，定稿后不能用旧 Package 开写", async () => {
    await turn(fx, "改一个字", [
      fauxAssistantMessage([
        fauxToolCall("edit", {
          path: `tasks/${fx.hub.taskId}/agents/writer-1/draft.md`,
          edits: [{ oldText: "没有进去", newText: "没有迈进去" }],
        }),
      ]),
      fauxAssistantMessage([fauxToolCall("save_revision", {})]),
    ]);
    assert.equal(toolTexts(fx.session, "save_revision").at(-1), "draft_2");
    const meta = JSON.parse(readFileSync(join(fx.work.workDir, "tasks", fx.hub.taskId, "artifacts", "draft_2.json"), "utf8"));
    assert.equal(meta.writer_id, "writer-1");
    assert.equal(meta.package_id, "package_2");
    fx.faux.reviewer.appendResponses([
      async (ctx) => {
        reviewerTwo = JSON.stringify(ctx);
        return fauxAssistantMessage([fauxToolCall("save_review", { review: passedReview() })]);
      },
      fauxAssistantMessage("第二位检查完了"),
    ]);
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "reviewer", draft_id: "draft_2" })]),
      fauxAssistantMessage("再查一次"),
      fauxAssistantMessage("第二次检查到了"),
    ]);
    await fx.session.prompt("再检查一版");
    await waitFor(() => transcript(fx.session).includes("review_2"), "第二次检查");
    await fx.session.waitForIdle();
    assert.doesNotMatch(reviewerTwo, /REVIEWER_ONE_SECRET/);
    assert.match(toolTexts(fx.session, "spawn_subagent").join("\n"), /reviewer-2/);
    fx.faux.context.setResponses([fauxAssistantMessage("开始同步")]);
    await fx.session.prompt("/finalize draft_2");
    await fx.session.waitForIdle();
    const chapter = JSON.parse(readFileSync(join(fx.work.workDir, "canon", "chapters", "ch1.json"), "utf8"));
    assert.equal(chapter.status, "finalized");
    assert.equal(chapter.order, 1);
    assert.equal(chapter.summary, "");
    const sync = JSON.parse(readFileSync(join(fx.work.workDir, "canon", "sync.json"), "utf8"));
    assert.deepEqual(sync.pending_chapter_ids, ["ch1"]);
    assert.equal(liveMessages(fx.session).some((message) => message.role === "user" && JSON.stringify(message.content).includes("已定稿，请进行 Context 同步")), false);
    assert.match(transcript(fx.session), /ch1 已定稿，请进行 Context 同步/);
    await turn(fx, "再存一份要求", [fauxAssistantMessage([fauxToolCall("save_package", { brief, pack })])]);
    assert.match(toolTexts(fx.session, "save_package").at(-1) ?? "", /\[拒绝\].*待同步/);
    await turn(fx, "再派写手", [
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "writer", package_id: "package_2" })]),
    ]);
    assert.match(toolTexts(fx.session, "spawn_subagent").at(-1) ?? "", /\[拒绝\].*待同步/);
    fx.faux.context.setResponses([fauxAssistantMessage("再次定稿后同步")]);
    await fx.session.prompt("/finalize draft_2");
    await fx.session.waitForIdle();
    const again = JSON.parse(readFileSync(join(fx.work.workDir, "canon", "chapters", "ch1.json"), "utf8"));
    assert.equal(again.order, 1);
    assert.equal(again.summary, "");
    assert.deepEqual(JSON.parse(readFileSync(join(fx.work.workDir, "canon", "sync.json"), "utf8")).pending_chapter_ids, ["ch1"]);
  });

  test("同步只接受定稿正文里的依据，摘要写入后可以开始下一章", async () => {
    const proposal = {
      chapter_id: "ch1",
      changes: [
        {
          id: "sum",
          change: { type: "chapter_meta", chapter_id: "ch1", summary: "林凡停在矿洞口。", key_characters: ["lin"] },
          evidence: ["林凡停在矿洞口"],
          rationale: "正文写他停在洞口",
        },
      ],
    };
    await turn(fx, "证据不在正文里", [
      fauxAssistantMessage([
        fauxToolCall("save_sync_proposal", {
          ...proposal,
          changes: [{ ...proposal.changes[0], evidence: ["这段不在定稿正文中"] }],
        }),
      ]),
    ]);
    assert.match(toolTexts(fx.session, "save_sync_proposal").at(-1) ?? "", /\[拒绝\].*定稿正文/);
    await turn(fx, "摘要写到别的章", [
      fauxAssistantMessage([
        fauxToolCall("save_sync_proposal", {
          ...proposal,
          changes: [{ ...proposal.changes[0], change: { ...proposal.changes[0].change, chapter_id: "ch2" } }],
        }),
      ]),
    ]);
    assert.match(toolTexts(fx.session, "save_sync_proposal").at(-1) ?? "", /\[拒绝\].*chapter_meta/);
    await turn(fx, "提交清单", [fauxAssistantMessage([fauxToolCall("save_sync_proposal", proposal)])]);
    assert.equal(toolTexts(fx.session, "save_sync_proposal").at(-1), "proposal_1");
    await turn(fx, "还没核对就写入", [
      fauxAssistantMessage([fauxToolCall("apply_sync", { proposal_id: "proposal_1", change_ids: ["sum"] })]),
    ]);
    assert.match(toolTexts(fx.session, "apply_sync").at(-1) ?? "", /\[拒绝\].*核对/);
    const unsupported = {
      verdicts: [{ change_id: "sum", verdict: "unsupported", reason: "先记一笔不成立的结论", conflicting_ids: [] }],
    };
    const supported = {
      verdicts: [{ change_id: "sum", verdict: "supported", reason: "正文写了林凡停在矿洞口", conflicting_ids: [] }],
    };
    fx.faux.sync_checker.setResponses([
      fauxAssistantMessage([fauxToolCall("save_sync_check", { verdicts: [] })]),
      fauxAssistantMessage([fauxToolCall("save_sync_check", unsupported)]),
      fauxAssistantMessage("第一次核对完了"),
    ]);
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "sync_checker", proposal_id: "proposal_1" })]),
      fauxAssistantMessage("等核对"),
      fauxAssistantMessage("核对到了"),
    ]);
    await fx.session.prompt("请核对");
    await waitFor(() => transcript(fx.session).includes("check_"), "核对通知");
    await fx.session.waitForIdle();
    assert.match(subagentTranscript(fx, "sync_checker-1"), /恰好一条结论/);
    await turn(fx, "没有作者确认不能写入无依据的变更", [
      fauxAssistantMessage([fauxToolCall("apply_sync", { proposal_id: "proposal_1", change_ids: ["sum"] })]),
    ]);
    assert.match(toolTexts(fx.session, "apply_sync").at(-1) ?? "", /\[拒绝\].*作者确认/);
    await turn(fx, "不能给核对员发消息", [
      fauxAssistantMessage([fauxToolCall("send_message", { agent_id: "sync_checker-1", message: "改成有依据" })]),
    ]);
    assert.match(toolTexts(fx.session, "send_message").at(-1) ?? "", /\[拒绝\]/);
    fx.faux.sync_checker.appendResponses([
      fauxAssistantMessage([fauxToolCall("save_sync_check", supported)]),
      fauxAssistantMessage("第二次核对完了"),
    ]);
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "sync_checker", proposal_id: "proposal_1" })]),
      fauxAssistantMessage("再核对"),
      fauxAssistantMessage("新核对到了"),
    ]);
    await fx.session.prompt("再核对一次");
    await waitFor(() => transcript(fx.session).includes("check_2"), "第二次核对");
    await fx.session.waitForIdle();
    await turn(fx, "按最新核对写入", [
      fauxAssistantMessage([fauxToolCall("apply_sync", { proposal_id: "proposal_1", change_ids: ["sum"] })]),
    ]);
    assert.doesNotMatch(toolTexts(fx.session, "apply_sync").at(-1) ?? "", /\[拒绝\]/);
    const chapter = JSON.parse(readFileSync(join(fx.work.workDir, "canon", "chapters", "ch1.json"), "utf8"));
    assert.equal(chapter.summary, "林凡停在矿洞口。");
    const sync = JSON.parse(readFileSync(join(fx.work.workDir, "canon", "sync.json"), "utf8"));
    assert.deepEqual(sync.pending_chapter_ids, []);
    await turn(fx, "现在可以准备下一章", [fauxAssistantMessage([fauxToolCall("save_package", { brief: { ...brief, id: "brief-2", chapter_id: "ch2" }, pack })])]);
    assert.equal(toolTexts(fx.session, "save_package").at(-1), "package_3");
    await turn(fx, "重写第一章", [
      fauxAssistantMessage([
        fauxToolCall("save_package", { brief: { ...brief, id: "brief-3", mode: "rewrite_chapter" }, pack }),
      ]),
    ]);
    assert.equal(toolTexts(fx.session, "save_package").at(-1), "package_4");
  });

  test("对照比较不把映射写进会话，审计数字和脚本一致", async () => {
    fx.faux.context.setResponses([fauxAssistantMessage("好")]);
    await fx.session.prompt("/compare");
    await fx.session.waitForIdle();
    const mappingPath = join(fx.work.runtimeDir, "compare", `${fx.hub.taskId}.json`);
    const first = JSON.parse(readFileSync(mappingPath, "utf8")) as { jia: string; yi: string };
    assert.equal(first.jia, "draft_1");
    assert.equal(first.yi, "draft_2");
    fx.faux.context.setResponses([fauxAssistantMessage("好")]);
    await fx.session.prompt("/compare");
    await fx.session.waitForIdle();
    const second = JSON.parse(readFileSync(mappingPath, "utf8")) as { jia: string; yi: string };
    assert.equal(second.jia, "draft_2");
    assert.equal(second.yi, "draft_1");
    const blind = readFileSync(join(fx.work.workDir, "tasks", fx.hub.taskId, "compare", "甲.md"), "utf8");
    assert.doesNotMatch(blind, /draft_/);
    fx.faux.context.setResponses([fauxAssistantMessage("好")]);
    await fx.session.prompt("/compare-pick 甲 因为更完整");
    await fx.session.waitForIdle();
    assert.doesNotMatch(readFileSync(fx.session.sessionFile ?? "", "utf8"), /揭晓/);
    const evaluation = readFileSync(join(fx.work.runtimeDir, "evaluations.jsonl"), "utf8").trim().split("\n").at(-1);
    const record = JSON.parse(evaluation ?? "{}") as { choice: string; mapping: { 甲: string }; review_count: number; char_counts: { 甲: number } };
    assert.equal(record.choice, "甲");
    assert.equal(record.mapping.甲, "draft_2");
    assert.ok(record.review_count >= 2);
    assert.equal(record.char_counts.甲 > 0, true);
    await turn(fx, "读映射", [fauxAssistantMessage([fauxToolCall("read", { path: mappingPath })])]);
    assert.match(toolTexts(fx.session, "read").at(-1) ?? "", /\[拒绝\]/);
    const reportPath = await writeAudit(fx.config, fx.work.workDir, fx.hub.taskId);
    const report = readFileSync(reportPath, "utf8");
    assert.match(report, /context save_package：/);
    assert.match(report, /\[拒绝\]/);
    assert.match(report, /package：4/);
    assert.match(report, /plan：1/);
    assert.match(report, /draft：2/);
    assert.match(report, /review：2/);
    assert.match(report, /proposal：1/);
    assert.match(report, /proposal_1：2 次核对/);
    assert.match(report, /定稿 draft_2 最近一次检查：requirements=passed/);
    assert.equal(existsSync(reportPath), true);
    const registry = loadRegistry(fx.hub.task);
    assert.equal(registry.finalizations[0]?.draft_id, "draft_2");
  });

  test("不支持的 thinking 档位会报错而不是静默调整", async () => {
    const config = structuredClone(fx.config);
    const agentDir = join(fx.root, "fresh-agent");
    config.roles.reviewer.thinking = "medium";
    await assert.rejects(resolveRoleModels(config, agentDir), /thinking/);
    config.roles.reviewer.thinking = "high";
    config.roles.writer.model = "custom-noya";
    config.roles.writer.thinking = "high";
    config.roles.writer.contextWindow = 4096;
    config.roles.writer.maxOutput = 256;
    config.roles.writer.thinkingLevels = ["high"];
    const resolved = await resolveRoleModels(config, agentDir);
    assert.equal(resolved.models.reviewer.model.id, "deepseek-v4-pro");
    assert.equal(resolved.models.writer.model.id, "custom-noya");
    assert.equal(resolved.models.writer.model.contextWindow, 4096);
    assert.equal(resolved.models.writer.model.maxTokens, 256);
  });

  test("停止后的 Writer 可以继续，新 Writer 退役旧的，检查不回查正式区", async () => {
    fx.faux.writer.appendResponses([
      fauxAssistantMessage([fauxToolCall("read", { path: join(fx.work.workDir, "canon", "characters", "lin.json") })]),
      fauxAssistantMessage("读不到"),
    ]);
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("send_message", { agent_id: "writer-1", message: "读一下人物文件" })]),
      fauxAssistantMessage("让他读"),
      fauxAssistantMessage("读完了"),
    ]);
    await fx.session.prompt("让写手读人物");
    await waitFor(() => subagentTranscript(fx, "writer-1").includes("不在允许访问"), "写手越界");
    await fx.session.waitForIdle();

    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("stop_subagent", { agent_id: "writer-1" })]),
      fauxAssistantMessage("停"),
      fauxAssistantMessage("已停"),
    ]);
    await fx.session.prompt("停掉写手");
    await fx.session.waitForIdle();
    assert.equal(loadRegistry(fx.hub.task).subagents.find((item) => item.id === "writer-1")?.status, "stopped");

    let resumedText = "";
    fx.faux.writer.appendResponses([
      async (ctx) => {
        resumedText = JSON.stringify(ctx);
        return fauxAssistantMessage("继续写");
      },
    ]);
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("send_message", { agent_id: "writer-1", message: "接着写洞口" })]),
      fauxAssistantMessage("已送出"),
      fauxAssistantMessage("写手回复了"),
    ]);
    await fx.session.prompt("让他继续");
    await waitFor(() => resumedText.includes("接着写洞口"), "停止后的新一轮");
    await fx.session.waitForIdle();
    assert.match(resumedText, /Writing Brief/);

    const slip = {
      schema_version: 1,
      id: "slip",
      kind: "clue",
      name: "纸条",
      aliases: [],
      summary: "一张纸条",
      effects: [],
      requirements: [],
      limitations: [],
      attributes: [],
      content: "纸条上写着矿洞口",
    };
    await turn(fx, "可以记下纸条", [
      fauxAssistantMessage([fauxToolCall("write_canon", { author_confirmation: "可以", changes: [{ type: "library", op: "upsert", doc: slip }] })]),
    ]);
    assert.doesNotMatch(toolTexts(fx.session, "write_canon").at(-1) ?? "", /\[拒绝\]/);
    const slipBrief = { ...brief, id: "brief-slip", chapter_id: "ch3", intent: "写纸条被发现" };
    const slipPack = "## 纸条\n来源：slip\n\n纸条上写着矿洞口。\n";
    await turn(fx, "准备纸条这一章", [fauxAssistantMessage([fauxToolCall("save_package", { brief: slipBrief, pack: slipPack })])]);
    assert.equal(toolTexts(fx.session, "save_package").at(-1), "package_5");

    fx.faux.writer.appendResponses([
      fauxAssistantMessage([fauxToolCall("write", { path: "plan.md", content: "# 方案\n\n看见纸条。" })]),
      fauxAssistantMessage([fauxToolCall("submit_plan", {})]),
      fauxAssistantMessage([fauxToolCall("write", { path: "draft.md", content: draftBody })]),
      fauxAssistantMessage([fauxToolCall("submit_draft", {})]),
      fauxAssistantMessage("纸条章写好了"),
    ]);
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "writer", package_id: "package_5" })]),
      fauxAssistantMessage("派出第二个写手"),
      fauxAssistantMessage("第二个写完了"),
    ]);
    await fx.session.prompt("派新写手写纸条");
    await waitFor(() => transcript(fx.session).includes("draft_3"), "第二位写手交稿");
    await fx.session.waitForIdle();
    const agents = loadRegistry(fx.hub.task).subagents;
    assert.equal(agents.find((item) => item.id === "writer-1")?.status, "retired");
    assert.equal(agents.find((item) => item.id === "writer-2")?.status, "idle");

    await turn(fx, "可以删掉纸条", [
      fauxAssistantMessage([
        fauxToolCall("write_canon", { author_confirmation: "可以", changes: [{ type: "library", op: "delete", id: "slip" }] }),
      ]),
    ]);
    assert.doesNotMatch(toolTexts(fx.session, "write_canon").at(-1) ?? "", /\[拒绝\]/);
    fx.faux.reviewer.appendResponses([
      fauxAssistantMessage([fauxToolCall("write", { path: "draft.md", content: "偷偷改" })]),
      fauxAssistantMessage([fauxToolCall("save_review", { review: { ...passedReview(), chapter_id: "ch3" } })]),
      fauxAssistantMessage("查完纸条"),
    ]);
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "reviewer", draft_id: "draft_3" })]),
      fauxAssistantMessage("请检查"),
      fauxAssistantMessage("检查到了"),
    ]);
    await fx.session.prompt("检查纸条初稿");
    await waitFor(() => transcript(fx.session).includes("review_3"), "来源删除后的检查");
    await fx.session.waitForIdle();
    const reviewerId = loadRegistry(fx.hub.task).subagents.find((item) => item.role === "reviewer" && item.inputRef === "draft_3")?.id ?? "";
    const reviewText = subagentTranscript(fx, reviewerId);
    assert.match(reviewText, /Tool write not found/);
    assert.match(reviewText, /review_3/);
    assert.doesNotMatch(reviewText, /不是已有正式资料/);

    let releaseStop: () => void = () => undefined;
    const stopGate = new Promise<void>((resolve) => {
      releaseStop = resolve;
    });
    fx.faux.writer.appendResponses([
      async () => {
        await stopGate;
        return fauxAssistantMessage("不该再写");
      },
    ]);
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "writer", package_id: "package_4" })]),
      fauxAssistantMessage("第三个写手出发"),
    ]);
    await fx.session.prompt("再派一个写手");
    await waitFor(() => loadRegistry(fx.hub.task).subagents.some((item) => item.id === "writer-3" && item.status === "running"), "第三个写手运行");
    fx.faux.context.setResponses([fauxAssistantMessage("已经停了")]);
    const stopping = fx.session.prompt("/stop");
    releaseStop();
    await stopping;
    await fx.session.waitForIdle();
    assert.equal(loadRegistry(fx.hub.task).subagents.find((item) => item.id === "writer-3")?.status, "stopped");

    fx.hub.registry.subagents.push({
      id: "writer-9",
      role: "writer",
      sessionFile: "",
      inputRef: "package_4",
      status: "running",
      artifacts: [],
      rounds: [{ startedAt: new Date().toISOString(), artifacts: [] }],
      workspaceDir: fx.hub.task.agentsDir,
    });
    fx.hub.save();
    const resumed = await openWritingSession({
      work: fx.work,
      config: fx.config,
      runtime: fx.runtime,
      models: fx.hub.models,
      resume: true,
    });
    try {
      const afterResume = loadRegistry(fx.hub.task);
      const exited = afterResume.subagents.find((item) => item.id === "writer-9");
      assert.equal(exited?.status, "terminated");
      assert.equal(exited?.failureReason, "进程退出");
      assert.ok(exited?.rounds.at(-1)?.endedAt);
      assert.equal(afterResume.subagents.find((item) => item.id === "writer-3")?.status, "stopped");
      let continued = "";
      fx.faux.writer.appendResponses([
        async (ctx) => {
          continued = JSON.stringify(ctx);
          return fauxAssistantMessage("恢复后写完");
        },
      ]);
      fx.faux.context.setResponses([
        fauxAssistantMessage([fauxToolCall("send_message", { agent_id: "writer-3", message: "恢复后写一句" })]),
        fauxAssistantMessage("送出"),
        fauxAssistantMessage("恢复后的回复到了"),
      ]);
      await resumed.runtimeHost.session.prompt("继续停掉的写手");
      await waitFor(() => continued.includes("恢复后写一句"), "继续任务后的新一轮");
      await resumed.runtimeHost.session.waitForIdle();
    } finally {
      resumed.runtimeHost.session.dispose();
    }
  });
});
