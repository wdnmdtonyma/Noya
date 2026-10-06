import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TaskSummary, WorkSummary } from "../src/local-contract.ts";
import { deriveSidebar } from "../ui/sidebar.ts";

const created = new Date(2026, 9, 6, 8, 5).toISOString();
const earlier = new Date(2026, 9, 6, 7, 0).toISOString();

function task(patch: Partial<TaskSummary> & Pick<TaskSummary, "taskId" | "name">): TaskSummary {
  return {
    workId: "w1", createdAt: created, status: "idle", needsDecision: false, ...patch,
  };
}

const works: WorkSummary[] = [{ workId: "w1", name: "雨夜" }, { workId: "w2", name: "旧稿" }];

function model(patch: Partial<Parameters<typeof deriveSidebar>[0]> = {}) {
  return deriveSidebar({
    works, tasks: [task({ taskId: "t1", name: "写雨夜开门" })], workId: "w1", taskId: "t1",
    active: null, connected: true, shortcut: "⌘\\", ...patch,
  });
}

describe("sidebar task rows", () => {
  it("uses status text in the specified priority", () => {
    const rows = deriveSidebar({
      works, workId: "w1", taskId: "none", active: { workId: "w1", taskId: "run" }, connected: true, shortcut: "⌘\\",
      tasks: [
        task({ taskId: "broken", name: "损坏", error: "无法读取" }),
        task({ taskId: "run", name: "进行", status: "running", needsDecision: true }),
        task({ taskId: "stop", name: "停止中", status: "stopping" }),
        task({ taskId: "wait", name: "决定", needsDecision: true }),
        task({ taskId: "fail", name: "失败", status: "failed" }),
        task({ taskId: "cut", name: "中断", status: "interrupted" }),
        task({ taskId: "halt", name: "停止", status: "stopped" }),
        task({ taskId: "idle", name: "空闲" }),
      ],
    }).tasks;
    const text = Object.fromEntries(rows.map(row => [row.taskId, row.status]));
    assert.deepEqual(text, {
      broken: "记录损坏", run: "执行中", stop: "正在停止", wait: "待决定",
      fail: "执行失败", cut: "已中断", halt: "已停止", idle: "10月6日 08:05",
    });
  });

  it("orders tasks by creation time descending and keeps the current work only through the given list", () => {
    const rows = model({
      tasks: [
        task({ taskId: "old", name: "先写的", createdAt: earlier }),
        task({ taskId: "new", name: "后写的", createdAt: created }),
      ],
    }).tasks;
    assert.deepEqual(rows.map(row => row.taskId), ["new", "old"]);
    assert.equal(rows[0]?.status, "10月6日 08:05");
  });

  it("marks tone, the current row, and a pulse only for the live active task", () => {
    const rows = deriveSidebar({
      works, workId: "w1", taskId: "wait", active: { workId: "w1", taskId: "run" }, connected: true, shortcut: "⌘\\",
      tasks: [
        task({ taskId: "run", name: "进行", status: "running" }),
        task({ taskId: "other", name: "另一场", status: "running" }),
        task({ taskId: "fail", name: "失败", status: "failed" }),
        task({ taskId: "stop", name: "停止中", status: "stopping" }),
        task({ taskId: "halt", name: "停止", status: "stopped" }),
        task({ taskId: "cut", name: "中断", status: "interrupted" }),
        task({ taskId: "wait", name: "决定", needsDecision: true }),
      ],
    }).tasks;
    const byId = Object.fromEntries(rows.map(row => [row.taskId, row]));
    assert.equal(byId.run?.tone, "running");
    assert.equal(byId.run?.live, true);
    assert.equal(byId.other?.live, false);
    assert.equal(byId.fail?.tone, "failed");
    assert.equal(byId.stop?.tone, "warn");
    assert.equal(byId.halt?.tone, "warn");
    assert.equal(byId.cut?.tone, "warn");
    assert.equal(byId.wait?.tone, "idle");
    assert.equal(byId.wait?.current, true);
    assert.equal(byId.run?.clickable, true);
    const broken = model({ tasks: [task({ taskId: "broken", name: "损坏", error: "无法读取", status: "failed" })] }).tasks[0];
    assert.equal(broken?.clickable, false);
    assert.equal(broken?.tone, "idle");
    assert.equal(broken?.status, "记录损坏");
  });

  it("forces every tone offline and drops the running pulse when disconnected", () => {
    const view = deriveSidebar({
      works, workId: "w1", taskId: "run", active: { workId: "w1", taskId: "run" }, connected: false, shortcut: "⌘\\",
      tasks: [task({ taskId: "run", name: "进行", status: "running" }), task({ taskId: "fail", name: "失败", status: "failed" })],
    });
    assert.deepEqual(view.tasks.map(row => row.tone), ["offline", "offline"]);
    assert.equal(view.tasks[0]?.live, false);
  });
});

describe("sidebar badge and work card", () => {
  it("prefers a running badge, then a failed badge, and hides running while offline", () => {
    assert.equal(model({ active: { workId: "w1", taskId: "t1" }, tasks: [task({ taskId: "t1", name: "进行", status: "running" }), task({ taskId: "f", name: "失败", status: "failed" })] }).badge, "running");
    assert.equal(model({ tasks: [task({ taskId: "t1", name: "失败", status: "failed" })] }).badge, "failed");
    assert.equal(model().badge, null);
    assert.equal(model({ connected: false, active: { workId: "w1", taskId: "t1" }, tasks: [task({ taskId: "t1", name: "进行", status: "running" })] }).badge, null);
    assert.equal(model({ connected: false, tasks: [task({ taskId: "t1", name: "失败", status: "failed" })] }).badge, "failed");
    assert.equal(model({ tasks: [task({ taskId: "t1", name: "损坏", error: "无法读取", status: "failed" })] }).badge, null);
  });

  it("shows the current work, its first character, and only that work's task count", () => {
    const view = model({ tasks: [task({ taskId: "t1", name: "甲" }), task({ taskId: "t2", name: "乙" })] });
    assert.deepEqual(view.work, { initial: "雨", name: "雨夜", detail: "2 个写作任务" });
    assert.deepEqual(model({ workId: "", taskId: "", tasks: [] }).work, { initial: "选", name: "选择作品", detail: "切换作品" });
  });

  it("lists works without task counts", () => {
    const view = model({ active: { workId: "w2", taskId: "elsewhere" } });
    assert.deepEqual(view.works, [
      { workId: "w1", name: "雨夜", current: true, executing: false },
      { workId: "w2", name: "旧稿", current: false, executing: true },
    ]);
    assert.equal("count" in (view.works[0] ?? {}), false);
  });
});

describe("sidebar tips", () => {
  it("names the work, the current task count, the offline note, and the shortcut", () => {
    const view = model({ tasks: [task({ taskId: "t1", name: "写雨夜开门" }), task({ taskId: "t2", name: "另一页" })] });
    assert.equal(view.tips.work, "切换作品\n雨夜");
    assert.equal(view.tips.tasks, "写作任务\n2 个 · 当前「写雨夜开门」");
    assert.equal(view.tips.newTask, "新建任务");
    assert.equal(view.tips.collapse, "收起侧边栏\n⌘\\");
    assert.equal(view.tips.expand, "展开侧边栏\n⌘\\");
    assert.equal(model({ connected: false }).tips.newTask, "新建任务\n连接恢复后可用");
  });
});
