import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { RoleName } from "./config.ts";
import { ajv, checkSchema, toolValidators } from "./schema.ts";
import type { TaskHub } from "./hub.ts";
import { refuse } from "./util.ts";

const parameters = Type.Object({}, { additionalProperties: Type.Any() });
const emptyArgs = ajv.compile({ type: "object", additionalProperties: false });

type Validator = { (data: unknown): boolean; errors?: { instancePath?: string; message?: string }[] | null };

function prepare(validator: Validator, args: unknown, label: string): Record<string, unknown> {
  const value = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const problems = checkSchema(validator as Parameters<typeof checkSchema>[0], value, label);
  if (problems.length > 0) refuse(...problems);
  return value;
}

function tool(
  pi: ExtensionAPI,
  name: string,
  description: string,
  validator: Validator,
  run: (args: Record<string, unknown>) => Promise<string> | string,
  sequential = false,
): void {
  pi.registerTool({
    name,
    label: name,
    description,
    parameters,
    ...(sequential ? { executionMode: "sequential" as const } : {}),
    prepareArguments: (args) => prepare(validator, args, name),
    async execute(_toolCallId, params) {
      const text = await run(params as Record<string, unknown>);
      return { content: [{ type: "text", text }], details: {} };
    },
  });
}

export function registerRoleTools(pi: ExtensionAPI, hub: TaskHub, role: RoleName, agentId?: string): void {
  if (role === "context") {
    tool(pi, "query_canon", "查询正式资料。op 为 search、get、list 或 subtree。", toolValidators.query, (args) => hub.queryCanon(args));
    tool(pi, "write_canon", "把作者确认过的人物、资料库、世界志或大纲变更写入正式资料。", toolValidators.writeCanon, (args) => hub.writeCanon(args), true);
    tool(pi, "save_package", "保存 Writing Brief 和 Context Pack，返回 package_id。", toolValidators.package, (args) => hub.savePackage(args), true);
    tool(pi, "save_revision", "把当前活跃 Writer 的初稿工作文件快照为新初稿。", emptyArgs, () => hub.saveRevision(), true);
    tool(pi, "save_sync_proposal", "保存定稿后的资料变化清单，返回 proposal_id。", toolValidators.syncProposal, (args) => hub.saveSyncProposal(args), true);
    tool(pi, "apply_sync", "按最新核对结果写入选中的资料变化。", toolValidators.applySync, (args) => hub.applySync(args), true);
    tool(pi, "spawn_subagent", "派出 writer、reviewer 或 sync_checker。不接受自由文本。", toolValidators.spawn, (args) => hub.spawnSubagent(args), true);
    tool(pi, "send_message", "给 Writer 发送消息。检查员和同步核对员不能接收消息。", toolValidators.send, (args) => hub.sendMessage(args), true);
    tool(pi, "stop_subagent", "停止一个正在运行的 Subagent。", toolValidators.stop, (args) => hub.stopSubagent(args), true);
    tool(pi, "get_subagents", "查看本任务的 Subagent 状态。", toolValidators.agent, (args) => hub.getSubagents(args));
  }
  if (role === "writer" && agentId) {
    tool(pi, "submit_plan", "提交工作目录中的 plan.md。", emptyArgs, () => hub.submitPlan(agentId), true);
    tool(pi, "submit_draft", "提交工作目录中的 draft.md。提交前必须已经提交过方案。", emptyArgs, () => hub.submitDraft(agentId), true);
  }
  if (role === "reviewer" && agentId) {
    tool(pi, "save_review", "提交这一份初稿的检查结果。", toolValidators.reviewArgs, (args) => hub.saveReview(agentId, args), true);
  }
  if (role === "sync_checker" && agentId) {
    tool(pi, "query_canon", "只读查询正式资料，用来核对变化是否与既有设定冲突。", toolValidators.query, (args) => hub.queryCanon(args));
    tool(pi, "save_sync_check", "提交对当前变更清单的逐条核对结论。", toolValidators.syncCheck, (args) => hub.saveSyncCheck(agentId, args), true);
  }
}
