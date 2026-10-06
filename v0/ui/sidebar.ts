import type { TaskRef, TaskSummary, WorkSummary } from "../src/local-contract.ts";

export type SidebarTone = "running" | "failed" | "warn" | "idle" | "offline";

export interface SidebarTaskRow {
  taskId: string;
  name: string;
  status: string;
  tone: SidebarTone;
  current: boolean;
  live: boolean;
  clickable: boolean;
}

export interface SidebarWorkRow {
  workId: string;
  name: string;
  current: boolean;
  executing: boolean;
  error?: string;
}

export interface SidebarModel {
  work: { initial: string; name: string; detail: string };
  tasks: SidebarTaskRow[];
  badge: "running" | "failed" | null;
  works: SidebarWorkRow[];
  tips: { work: string; tasks: string; newTask: string; collapse: string; expand: string };
}

export function createdLabel(iso: string): string {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return "记录不可用";
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function statusText(task: TaskSummary): string {
  if (task.error) return "记录损坏";
  if (task.status === "running") return "执行中";
  if (task.status === "stopping") return "正在停止";
  if (task.needsDecision) return "待决定";
  if (task.status === "failed") return "执行失败";
  if (task.status === "interrupted") return "已中断";
  if (task.status === "stopped") return "已停止";
  return createdLabel(task.createdAt);
}

function toneOf(task: TaskSummary, connected: boolean): SidebarTone {
  if (!connected) return "offline";
  if (task.error) return "idle";
  if (task.status === "failed") return "failed";
  if (task.status === "running") return "running";
  if (task.status === "stopping" || task.status === "stopped" || task.status === "interrupted") return "warn";
  return "idle";
}

function same(ref: TaskRef | null, task: { workId: string; taskId: string }): boolean {
  return !!ref && ref.workId === task.workId && ref.taskId === task.taskId;
}

export function deriveSidebar(input: {
  works: WorkSummary[];
  tasks: TaskSummary[];
  workId: string;
  taskId: string;
  active: TaskRef | null;
  connected: boolean;
  shortcut: string;
  currentTaskName?: string;
}): SidebarModel {
  const tasks = [...input.tasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.taskId.localeCompare(a.taskId));
  const rows = tasks.map(task => ({
    taskId: task.taskId,
    name: task.name,
    status: statusText(task),
    tone: toneOf(task, input.connected),
    current: task.taskId === input.taskId && task.workId === input.workId,
    live: input.connected && task.status === "running" && same(input.active, task),
    clickable: !task.error,
  }));
  const live = rows.some(row => row.live);
  const failed = tasks.some(task => !task.error && task.status === "failed");
  const work = input.works.find(item => item.workId === input.workId);
  const name = work?.name ?? "";
  const currentName = input.currentTaskName || rows.find(row => row.current)?.name || "";
  return {
    work: input.workId && name
      ? { initial: [...name][0] || "选", name, detail: `${tasks.length} 个写作任务` }
      : { initial: "选", name: "选择作品", detail: "切换作品" },
    tasks: rows,
    badge: live ? "running" : failed ? "failed" : null,
    works: input.works.map(item => ({
      workId: item.workId,
      name: item.name,
      current: item.workId === input.workId,
      executing: input.active?.workId === item.workId,
      ...(item.error ? { error: item.error } : {}),
    })),
    tips: {
      work: name ? `切换作品\n${name}` : "切换作品",
      tasks: `写作任务\n${tasks.length} 个 · 当前「${currentName || "未选择"}」`,
      newTask: input.connected ? "新建任务" : "新建任务\n连接恢复后可用",
      collapse: `收起侧边栏\n${input.shortcut}`,
      expand: `展开侧边栏\n${input.shortcut}`,
    },
  };
}
