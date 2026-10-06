import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { ProcessItem, SubRunView } from "../src/local-contract.ts";
import { activitySummary, deriveTurns, panelSections, subtaskEntryLabel, subtaskRows } from "../ui/feed.ts";

function tool(id: string, name: string, args: unknown, extra: Partial<Extract<ProcessItem, { kind: "tool" }>> = {}): Extract<ProcessItem, { kind: "tool" }> {
  return { kind: "tool", id, name, args, state: "done", result: "ok", at: extra.at ?? 0, ...extra };
}

function message(id: string, role: "user" | "assistant", text: string, time: number): Extract<ProcessItem, { kind: "message" }> {
  return { kind: "message", id, role, text, at: time };
}

function run(partial: Partial<SubRunView> & Pick<SubRunView, "agentId" | "round" | "outcome" | "startedAt">): SubRunView {
  return { continued: false, instruction: partial.title ?? "", results: [], items: [], ...partial };
}

describe("动作摘要", () => {
  test("文件归并、设定短语和未知工具名组成一句，不出现步数或调用次数", () => {
    const summary = activitySummary([
      tool("1", "read", { path: "canon/chapter-1.md" }, { at: 1 }),
      tool("2", "read", { path: "canon/chapter-1.md" }, { at: 2 }),
      tool("3", "query_canon", { op: "search", query: "万舟" }, { at: 3 }),
      tool("4", "custom_probe", { topic: "刻痕" }, { at: 4 }),
    ]);
    assert.equal(summary, "读取了 chapter-1.md，查阅了设定：万舟，custom_probe");
    assert.doesNotMatch(summary, /步|次/);
  });

  test("不同文件按种类计数，超过三项时只留前两项和总数", () => {
    const summary = activitySummary([
      tool("1", "read", { path: "a.md" }),
      tool("2", "edit", { path: "b.md" }),
      tool("3", "query_canon", { query: "万舟" }),
      tool("4", "grep", { pattern: "刻痕" }),
    ]);
    assert.equal(summary, "读取了 a.md，修改了 b.md，等 4 项");
  });

  test("失败排在最前，没改动的文件不写成已修改", () => {
    assert.equal(activitySummary([
      tool("1", "read", { path: "notes.md" }, { at: 1 }),
      tool("2", "edit", { path: "chapter-1.md" }, { at: 2, state: "error", error: true, result: "权限不足" }),
    ]), "修改 chapter-1.md 失败，读取了 notes.md");
    assert.equal(activitySummary([
      tool("1", "edit", { path: "chapter-1.md" }, { result: "No changes applied" }),
    ]), "未改动 chapter-1.md");
    assert.equal(activitySummary([
      tool("1", "edit", { path: "chapter-1.md" }, { state: "stopped" }),
      tool("2", "write", { path: "draft.md" }, { state: "interrupted" }),
    ]), "修改 chapter-1.md 已停止，写入 draft.md 未完成");
  });

  test("进行中的动作排在末尾，断线时标明最后已知", () => {
    const items = [
      tool("1", "read", { path: "chapter-1.md" }, { at: 1 }),
      tool("2", "edit", { path: "chapter-1.md" }, { at: 2, state: "running", result: undefined }),
    ];
    assert.equal(activitySummary(items), "读取了 chapter-1.md，正在修改 chapter-1.md");
    assert.equal(activitySummary(items, { connected: false }), "读取了 chapter-1.md，最后已知 · 正在修改 chapter-1.md");
  });

  test("搜索和命令各自成句，思考单独成组时不编造时长", () => {
    assert.equal(activitySummary([
      tool("1", "grep", { pattern: "万舟" }),
      tool("2", "bash", { command: "git status" }),
    ]), "搜索了 万舟，运行了 git status");
    assert.equal(activitySummary([{ kind: "thinking", id: "t", text: "先看设定", at: 1 }]), "思考");
  });

  test("摘要只看工具和参数，同一组工具始终得到同一句", () => {
    const items = [tool("1", "read", { path: "chapter-1.md" }), tool("2", "query_canon", { query: "万舟" })];
    assert.equal(activitySummary(items), "读取了 chapter-1.md，查阅了设定：万舟");
  });
});

describe("轮次收起", () => {
  const card = run({ agentId: "writer-1", round: 1, outcome: "returned", startedAt: "2026-10-06T00:00:01.000Z", dispatchCallId: "spawn", title: "写开篇", results: [{ artifactId: "plan_1", title: "开篇方案", summary: "章节方案", readable: true }] });

  function sample(status: "idle" | "running" | "stopping" | "failed" | "interrupted" | "stopped", span = 11_000) {
    const process: ProcessItem[] = [
      message("u1", "user", "写第一章", 1_000),
      tool("read", "read", { path: "chapter-1.md" }, { at: 2_000 }),
      tool("spawn", "spawn_subagent", { role: "writer", task: "写开篇", package_id: "package_1" }, { at: 3_000, result: "writer-1" }),
      message("a1", "assistant", "开篇已经写好，可以定稿。", 1_000 + span),
      { kind: "event", id: "final", event: "finalized", text: "作者已定稿", at: 1_000 + span + 10 },
      { kind: "event", id: "start", event: "start", text: "开始执行", at: 1_500 },
    ];
    return deriveTurns(process, [card], status);
  }

  test("按作者发言切轮，收起行写出秒和分秒", () => {
    const [turn] = sample("idle");
    assert.equal(turn!.user?.text, "写第一章");
    assert.equal(turn!.label, "已处理 11 秒");
    assert.deepEqual(turn!.folded.map(block => block.kind), ["card", "message", "event"]);
    assert.equal(turn!.folded.find(block => block.kind === "message")?.message?.text, "开篇已经写好，可以定稿。");
    assert.equal(turn!.blocks.some(block => block.kind === "event" && block.event?.event === "start"), false);
    const long = sample("idle", 65_000);
    assert.equal(long[0]!.label, "已处理 1 分 05 秒");
  });

  test("失败、中断或停止的最后一轮改写收起行，并且不保留最后一条回复", () => {
    assert.equal(sample("failed")[0]!.label, "处理 11 秒后失败");
    assert.equal(sample("interrupted")[0]!.label, "处理 11 秒后中断");
    assert.equal(sample("stopped")[0]!.label, "处理 11 秒后停止");
    for (const status of ["failed", "interrupted", "stopped"] as const) {
      assert.equal(sample(status)[0]!.folded.some(block => block.kind === "message"), false);
      assert.equal(sample(status)[0]!.folded.some(block => block.kind === "card"), true);
    }
  });

  test("进行中的一轮保持展开，并给出正在处理或正在停止", () => {
    const running = sample("running")[0]!;
    assert.equal(running.running, true);
    assert.equal(running.liveLabel, "正在处理");
    assert.equal(running.liveFrozen, false);
    assert.equal(sample("stopping")[0]!.liveLabel, "正在停止");
    const offline = deriveTurns(sample("running")[0] ? [
      message("u", "user", "写", 1_000),
      tool("read", "read", { path: "chapter-1.md" }, { at: 2_000, state: "running", result: undefined }),
    ] : [], [], "running", false);
    assert.equal(offline[0]!.liveLabel, "连接断开，最新进展尚未确认");
    assert.equal(offline[0]!.liveFrozen, true);
  });

  test("停止标记留在那一轮，定稿时间不计入处理时长", () => {
    const turns = deriveTurns([
      message("u1", "user", "第一句", 1_000),
      message("a1", "assistant", "还没做完", 6_000),
      { kind: "event", id: "stop", event: "stopped", text: "已停止", at: 6_100 },
      message("u2", "user", "继续", 20_000),
      message("a2", "assistant", "继续之后的回复", 21_000),
      { kind: "event", id: "final", event: "finalized", text: "作者已定稿", at: 80_000 },
    ], [], "idle");
    assert.equal(turns[0]!.label, "处理 5 秒后停止");
    assert.equal(turns[0]!.folded.some(block => block.kind === "message"), false);
    assert.equal(turns[1]!.label, "已处理 1 秒");
  });

  test("两轮之间的过程不会并到下一句作者发言里", () => {
    const turns = deriveTurns([
      message("u1", "user", "第一句", 1),
      message("a1", "assistant", "先看资料", 2),
      message("u2", "user", "第二句", 3),
      message("a2", "assistant", "再改一版", 4),
    ], [], "idle");
    assert.deepEqual(turns.map(turn => turn.user?.text), ["第一句", "第二句"]);
    assert.equal(turns[0]!.blocks.at(-1)?.message?.text, "先看资料");
    assert.equal(turns[1]!.folded.at(-1)?.message?.text, "再改一版");
  });
});

describe("子任务入口、列表和面板顺序", () => {
  const runs = [
    run({ agentId: "writer-1", round: 1, outcome: "returned", startedAt: "2026-10-06T00:00:01.000Z", endedAt: "2026-10-06T00:00:02.000Z", title: "写开篇", results: [{ artifactId: "plan_1", title: "开篇方案", summary: "章节方案", readable: true }] }),
    run({ agentId: "writer-1", round: 2, outcome: "failed", startedAt: "2026-10-06T00:00:03.000Z", endedAt: "2026-10-06T00:00:04.000Z", title: "把结尾改短", continued: true, instruction: "把结尾改短", error: "模型调用失败\n第二行" }),
    run({ agentId: "writer-2", round: 1, outcome: "running", startedAt: "2026-10-06T00:00:05.000Z", title: "改动作顺序", liveAction: "正在修改 chapter-1.md", items: [] }),
    run({ agentId: "reviewer-1", round: 1, outcome: "returned", startedAt: "2026-10-06T00:00:02.500Z", endedAt: "2026-10-06T00:00:02.800Z", title: "检查开篇", results: [{ artifactId: "review_1", title: "检查报告", summary: "通过：万舟只观察变化", readable: true }] }),
  ];

  test("入口文案按卡片是否可见、进行中数量和失败数量决定", () => {
    assert.equal(subtaskEntryLabel(runs, { runningCardsVisible: true }), "子任务 3");
    assert.equal(subtaskEntryLabel(runs, { runningCardsVisible: false }), "writer-2 正在修改 chapter-1.md · 1 个失败");
    assert.equal(subtaskEntryLabel(runs, { runningCardsVisible: false, connected: false }), "writer-2 最后已知 · 正在修改 chapter-1.md · 1 个失败");
    const many = [...runs, run({ agentId: "writer-3", round: 1, outcome: "running", startedAt: "2026-10-06T00:00:06.000Z", title: "另一处", liveAction: "正在思考" })];
    assert.equal(subtaskEntryLabel(many, { runningCardsVisible: false }), "2 个子任务进行中 · 1 个失败");
    const failedOnly = runs.filter(item => item.agentId !== "writer-2");
    assert.equal(subtaskEntryLabel(failedOnly, { runningCardsVisible: false }), "1 个子任务失败");
    const done = [runs[0]!, runs[3]!];
    assert.equal(subtaskEntryLabel(done, { runningCardsVisible: false }), "子任务 2");
    assert.equal(subtaskEntryLabel([], { runningCardsVisible: false }), "");
  });

  test("列表进行中在前，其余按最近活动，并带首次任务说明和追加次数", () => {
    const rows = subtaskRows(runs);
    assert.deepEqual(rows.map(row => row.agentId), ["writer-2", "writer-1", "reviewer-1"]);
    assert.equal(rows[1]!.title, "写开篇");
    assert.equal(rows[1]!.continued, 1);
    assert.equal(rows[1]!.line, "模型调用失败");
    assert.equal(rows[1]!.label, "失败");
    assert.equal(rows[2]!.line, "检查报告");
  });

  test("面板按派发、执行、追加要求的时间排列", () => {
    const sections = panelSections("writer-1", runs, "idle");
    assert.deepEqual(sections.map(section => section.instruction || section.title), ["写开篇", "把结尾改短"]);
    assert.equal(sections[0]!.continued, false);
    assert.equal(sections[1]!.continued, true);
    assert.equal(sections[1]!.conclusion, "执行失败：模型调用失败");
    assert.deepEqual(sections[0]!.results.map(result => result.artifactId), ["plan_1"]);
    assert.equal(sections[1]!.results.length, 0);
  });
});
