import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { writeAudit } from "../src/audit.ts";
import { openWritingSession } from "../src/app.ts";
import { loadRegistry } from "../src/layout.ts";
import { fauxAssistantMessage, fauxToolCall, openFixture, toolTexts, waitFor, type Fixture } from "./harness.ts";

const brief = {
  schema_version: 1,
  id: "brief-1",
  chapter_id: "ch1",
  mode: "write_chapter",
  intent: "让林凡在洞口看见一把剑",
  requirements: ["写出他看见了什么"],
  constraints: [],
  ending: null,
  creative_scope: [],
  leave_open: [],
};

const pack = "## 无来源\n来源：无\n\n这一段没有正式资料。\n";
const swordDraft = "# 洞口\n\n林凡看见青铜剑。\n";

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

describe("记录不被写错", { concurrency: false }, () => {
  let fx: Fixture;
  let releaseReviews: () => void = () => undefined;

  before(async () => {
    fx = await openFixture({ random: () => 0 });
  });

  after(async () => {
    releaseReviews();
    await fx?.cleanup();
  });

  test("越界的产物 ID 不能派写手，也不会退役当前 Writer", async () => {
    await turn(fx, "准备第一章", [fauxAssistantMessage([fauxToolCall("save_package", { brief, pack })])]);
    assert.equal(toolTexts(fx.session, "save_package").at(-1), "package_1");
    fx.faux.writer.setResponses([
      fauxAssistantMessage([fauxToolCall("write", { path: "plan.md", content: "# 方案\n\n看见青铜剑。" })]),
      fauxAssistantMessage([fauxToolCall("submit_plan", {})]),
      fauxAssistantMessage([fauxToolCall("write", { path: "draft.md", content: swordDraft })]),
      fauxAssistantMessage([fauxToolCall("submit_draft", {})]),
      fauxAssistantMessage("写好了"),
    ]);
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "writer", package_id: "package_1" })]),
      fauxAssistantMessage("派出"),
      fauxAssistantMessage("收到初稿"),
    ]);
    await fx.session.prompt("派写手");
    await waitFor(() => loadRegistry(fx.hub.task).subagents.some((agent) => agent.id === "writer-1" && agent.status === "idle"), "写手交稿");
    await fx.session.waitForIdle();
    await turn(fx, "用别的任务的 Package", [
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "writer", package_id: "../../tfake/artifacts/package_9" })]),
    ]);
    assert.match(toolTexts(fx.session, "spawn_subagent").at(-1) ?? "", /\[拒绝\].*package_数字/);
    assert.equal(loadRegistry(fx.hub.task).subagents.find((agent) => agent.id === "writer-1")?.status, "idle");
  });

  test("同时保存的两份检查得到不同编号", async () => {
    let arrived = 0;
    const gate = new Promise<void>((resolve) => {
      releaseReviews = resolve;
    });
    fx.faux.reviewer.setResponses([
      async () => {
        arrived += 1;
        await gate;
        return fauxAssistantMessage([fauxToolCall("save_review", { review: passedReview() })]);
      },
      async () => {
        arrived += 1;
        await gate;
        return fauxAssistantMessage([fauxToolCall("save_review", { review: passedReview() })]);
      },
      fauxAssistantMessage("一位完"),
      fauxAssistantMessage("二位完"),
    ]);
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "reviewer", draft_id: "draft_1" })]),
      fauxAssistantMessage("等第一位"),
    ]);
    await fx.session.prompt("请第一位检查");
    await waitFor(() => arrived >= 1, "第一位检查员开始");
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "reviewer", draft_id: "draft_1" })]),
      fauxAssistantMessage("等第二位"),
      fauxAssistantMessage("收到检查一"),
      fauxAssistantMessage("收到检查二"),
    ]);
    await fx.session.prompt("请第二位检查");
    await waitFor(() => arrived >= 2, "第二位检查员开始");
    releaseReviews();
    const directory = join(fx.work.workDir, "tasks", fx.hub.taskId, "artifacts");
    await waitFor(() => existsSync(join(directory, "review_1.json")) && existsSync(join(directory, "review_2.json")), "两份检查落盘");
    await fx.session.waitForIdle();
    const first = JSON.parse(readFileSync(join(directory, "review_1.json"), "utf8")) as { review_id: string };
    const second = JSON.parse(readFileSync(join(directory, "review_2.json"), "utf8")) as { review_id: string };
    assert.equal(first.review_id, "review_1");
    assert.equal(second.review_id, "review_2");
  });

  test("重新定稿后不能再应用旧清单", async () => {
    fx.faux.context.setResponses([fauxAssistantMessage("开始同步")]);
    await fx.session.prompt("/finalize draft_1");
    await fx.session.waitForIdle();
    const proposal = {
      chapter_id: "ch1",
      changes: [
        {
          id: "sum",
          change: { type: "chapter_meta", chapter_id: "ch1", summary: "林凡捡到青铜剑。", key_characters: [] },
          evidence: ["林凡看见青铜剑"],
          rationale: "正文写他看见剑",
        },
      ],
    };
    await turn(fx, "提交清单", [fauxAssistantMessage([fauxToolCall("save_sync_proposal", proposal)])]);
    assert.equal(toolTexts(fx.session, "save_sync_proposal").at(-1), "proposal_1");
    fx.faux.sync_checker.setResponses([
      fauxAssistantMessage([
        fauxToolCall("save_sync_check", {
          verdicts: [{ change_id: "sum", verdict: "supported", reason: "正文写了看见青铜剑", conflicting_ids: [] }],
        }),
      ]),
      fauxAssistantMessage("核对完了"),
    ]);
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "sync_checker", proposal_id: "proposal_1" })]),
      fauxAssistantMessage("等核对"),
      fauxAssistantMessage("核对到了"),
    ]);
    await fx.session.prompt("请核对");
    await waitFor(() => existsSync(join(fx.work.workDir, "tasks", fx.hub.taskId, "artifacts", "check_1.json")), "核对落盘");
    await fx.session.waitForIdle();
    await turn(fx, "改成什么都没找到", [
      fauxAssistantMessage([
        fauxToolCall("edit", {
          path: `tasks/${fx.hub.taskId}/agents/writer-1/draft.md`,
          edits: [{ oldText: "林凡看见青铜剑。", newText: "林凡什么都没找到。" }],
        }),
      ]),
      fauxAssistantMessage([fauxToolCall("save_revision", {})]),
    ]);
    assert.equal(toolTexts(fx.session, "save_revision").at(-1), "draft_2");
    assert.equal(readFileSync(join(fx.work.workDir, "tasks", fx.hub.taskId, "artifacts", "draft_2.md"), "utf8").includes("什么都没找到"), true);
    fx.faux.context.setResponses([fauxAssistantMessage("再次定稿")]);
    await fx.session.prompt("/finalize draft_2");
    await fx.session.waitForIdle();
    await turn(fx, "把旧清单写进去", [
      fauxAssistantMessage([fauxToolCall("apply_sync", { proposal_id: "proposal_1", change_ids: ["sum"] })]),
    ]);
    assert.match(toolTexts(fx.session, "apply_sync").at(-1) ?? "", /\[拒绝\].*旧同步清单已过期/);
    const chapter = JSON.parse(readFileSync(join(fx.work.workDir, "canon", "chapters", "ch1.json"), "utf8"));
    assert.equal(chapter.summary, "");
    assert.match(chapter.content, /什么都没找到/);
    const sync = JSON.parse(readFileSync(join(fx.work.workDir, "canon", "sync.json"), "utf8"));
    assert.deepEqual(sync.pending_chapter_ids, ["ch1"]);
  });

  test("摘要先写入后，作者确认的其余变更仍能写入", async () => {
    const proposal = {
      chapter_id: "ch1",
      changes: [
        {
          id: "sum2",
          change: { type: "chapter_meta", chapter_id: "ch1", summary: "林凡空手而归。", key_characters: [] },
          evidence: ["林凡什么都没找到"],
          rationale: "正文写他没找到",
        },
        {
          id: "note",
          change: {
            type: "outline_node",
            op: "upsert",
            node: { id: "seen", order: 1, title: "洞口", content: "他什么都没找到", status: "planned", chapter_ids: [], key_characters: [] },
          },
          evidence: ["林凡什么都没找到"],
          rationale: "把这一幕记进大纲",
        },
      ],
    };
    await turn(fx, "提交两步清单", [fauxAssistantMessage([fauxToolCall("save_sync_proposal", JSON.parse(JSON.stringify(proposal)))])]);
    assert.equal(toolTexts(fx.session, "save_sync_proposal").at(-1), "proposal_2");
    fx.faux.sync_checker.appendResponses([
      fauxAssistantMessage([
        fauxToolCall("save_sync_check", {
          verdicts: [
            { change_id: "sum2", verdict: "supported", reason: "正文写了没找到", conflicting_ids: [] },
            { change_id: "note", verdict: "unsupported", reason: "大纲是否要记这一幕还没确认", conflicting_ids: [] },
          ],
        }),
      ]),
      fauxAssistantMessage("两步核对完了"),
    ]);
    fx.faux.context.setResponses([
      fauxAssistantMessage([fauxToolCall("spawn_subagent", { role: "sync_checker", proposal_id: "proposal_2" })]),
      fauxAssistantMessage("等两步核对"),
      fauxAssistantMessage("两步核对到了"),
    ]);
    await fx.session.prompt("核对两步清单");
    await waitFor(() => existsSync(join(fx.work.workDir, "tasks", fx.hub.taskId, "artifacts", "check_2.json")), "两步核对落盘");
    await fx.session.waitForIdle();
    await turn(fx, "先写入摘要", [
      fauxAssistantMessage([fauxToolCall("apply_sync", { proposal_id: "proposal_2", change_ids: ["sum2"] })]),
    ]);
    assert.doesNotMatch(toolTexts(fx.session, "apply_sync").at(-1) ?? "", /\[拒绝\]/);
    const cleared = JSON.parse(readFileSync(join(fx.work.workDir, "canon", "sync.json"), "utf8"));
    assert.deepEqual(cleared.pending_chapter_ids, []);
    await turn(fx, "同意写入持剑", [
      fauxAssistantMessage([
        fauxToolCall("apply_sync", {
          proposal_id: "proposal_2",
          change_ids: ["note"],
          author_confirmation: "同意写入持剑",
        }),
      ]),
    ]);
    assert.doesNotMatch(toolTexts(fx.session, "apply_sync").at(-1) ?? "", /\[拒绝\]/);
    const outline = JSON.parse(readFileSync(join(fx.work.workDir, "canon", "outline.json"), "utf8"));
    assert.equal(outline.nodes[0].id, "seen");
  });

  test("继续任务后仍能记录对照比较", async () => {
    fx.faux.context.setResponses([fauxAssistantMessage("好")]);
    await fx.session.prompt("/compare");
    await fx.session.waitForIdle();
    const blind = join(fx.work.runtimeDir, "compare", fx.hub.taskId, "甲.md");
    assert.equal(existsSync(blind), true);
    assert.equal(existsSync(join(fx.work.workDir, "tasks", fx.hub.taskId, "compare", "甲.md")), false);
    const resumed = await openWritingSession({
      work: fx.work,
      config: fx.config,
      runtime: fx.runtime,
      models: fx.hub.models,
      resume: true,
    });
    try {
      fx.faux.context.setResponses([fauxAssistantMessage("好")]);
      await resumed.runtimeHost.session.prompt("/compare-pick 甲 因为更完整");
      await resumed.runtimeHost.session.waitForIdle();
      const line = readFileSync(join(fx.work.runtimeDir, "evaluations.jsonl"), "utf8").trim().split("\n").at(-1);
      const record = JSON.parse(line ?? "{}") as { choice: string; mapping: { 甲: string } };
      assert.equal(record.choice, "甲");
      assert.equal(record.mapping.甲, "draft_1");
    } finally {
      resumed.runtimeHost.session.dispose();
    }
  });

  test("临时文件和只有一半的初稿不会进入审计或定稿", async () => {
    const artifacts = join(fx.work.workDir, "tasks", fx.hub.taskId, "artifacts");
    writeFileSync(join(artifacts, `review_7.json.${process.pid}.abcd.tmp`), "{}\n");
    writeFileSync(join(artifacts, "draft_99.json"), "{\"draft_id\":\"draft_99\"}\n");
    const report = readFileSync(await writeAudit(fx.config, fx.work.workDir, fx.hub.taskId), "utf8");
    assert.match(report, /draft：2/);
    assert.match(report, /review：2/);
    fx.faux.context.setResponses([fauxAssistantMessage("再定一次")]);
    await fx.session.prompt("/finalize");
    await fx.session.waitForIdle();
    const chapter = JSON.parse(readFileSync(join(fx.work.workDir, "canon", "chapters", "ch1.json"), "utf8"));
    assert.equal(chapter.summary, "");
    assert.equal(chapter.order, 1);
    assert.match(chapter.content, /什么都没找到/);
  });
});
