import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { RoleName } from "./config.ts";
import { checkSchema, toolContracts, type ToolContract } from "./schema.ts";
import type { TaskHub } from "./hub.ts";
import { refuse } from "./util.ts";

// 模型有时把对象或数组参数写成 JSON 字符串；按参数声明的类型解析回来再校验。
function parseStringified(value: Record<string, unknown>, parameters: Record<string, unknown>): Record<string, unknown> {
  const properties = (parameters.properties ?? {}) as Record<string, { type?: unknown }>;
  const out = { ...value };
  for (const [key, schema] of Object.entries(properties)) {
    const raw = out[key];
    if (typeof raw !== "string" || (schema.type !== "object" && schema.type !== "array")) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") out[key] = parsed;
    } catch {
      // 留给 schema 校验报类型错误
    }
  }
  return out;
}

function prepare(contract: ToolContract, args: unknown, label: string): Record<string, unknown> {
  const raw = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const value = parseStringified(raw, contract.parameters);
  const problems = checkSchema(contract.validate, value, label);
  if (problems.length > 0) refuse(...problems);
  return value;
}

function tool(
  pi: ExtensionAPI,
  name: string,
  description: string,
  contract: ToolContract,
  run: (args: Record<string, unknown>) => Promise<string> | string,
  sequential = false,
): void {
  pi.registerTool({
    name,
    label: name,
    description,
    parameters: contract.parameters as never,
    ...(sequential ? { executionMode: "sequential" as const } : {}),
    prepareArguments: (args) => prepare(contract, args, name) as never,
    async execute(_toolCallId, params) {
      const text = await run(params as Record<string, unknown>);
      return { content: [{ type: "text", text }], details: {} };
    },
  });
}

const QUERY_CANON =
  "查询正式资料。op=list 列出一类资料的 ID 与摘要；op=get 按 ID 取完整文档；op=search 全文搜索；op=subtree 取世界志节点及其下级。资料类型只有 chapter、character、library、world_node、outline_node。";

const WRITE_CANON = [
  "把作者确认过的变更写入正式资料。changes 中每一项由 type + op 决定格式：",
  "- character / library：op=upsert 带完整 doc（人物志或资料库条目，字段见参数说明），op=delete 带 id。",
  "- world_node：op=upsert 带 parent_id 与 node，op=delete 带 id。世界的空间、组织、运行规则写这里，不写进资料库。",
  "- outline_node：op=upsert 带 node，op=delete 带 id。",
  "资料库只收有稳定规则、会反复使用的功法、技能、法宝、丹药、材料或关键物品。一次确认的全部变更放进同一次调用。",
].join("\n");

export function registerRoleTools(pi: ExtensionAPI, hub: TaskHub, role: RoleName, agentId?: string): void {
  if (role === "context") {
    tool(pi, "ask_author", "只在真正需要作者选择方向时提问。结构性重写前复述新方向并确认；不要用于常规章节方案审批。提问后结束本轮等待真实回答。", toolContracts.decision, args => hub.askAuthor(args), true);
    tool(pi, "query_canon", QUERY_CANON, toolContracts.query, (args) => hub.queryCanon(args));
    tool(pi, "write_canon", WRITE_CANON, toolContracts.writeCanon, (args) => hub.writeCanon(args), true);
    tool(pi, "save_package", "保存本章的 Writing Brief 和 Context Pack，返回 package_id。", toolContracts.package, (args) => hub.savePackage(args), true);
    tool(pi, "save_revision", "把当前活跃 Writer 的初稿工作文件快照为新初稿。", toolContracts.empty, () => hub.saveRevision(), true);
    tool(
      pi,
      "save_sync_proposal",
      "保存定稿后的资料变化清单，返回 proposal_id。每条变化附定稿正文的逐字依据；变化本身的格式与 write_canon 相同，章节摘要用 type=chapter_meta。",
      toolContracts.syncProposal,
      (args) => hub.saveSyncProposal(args),
      true,
    );
    tool(pi, "apply_sync", "按最新核对结果写入同步清单中选中的变化。", toolContracts.applySync, (args) => hub.applySync(args), true);
    tool(pi, "spawn_subagent", "派出 writer、reviewer 或 sync_checker。只接受对应的产物 ID，不接受自由文本。", toolContracts.spawn, (args) => hub.spawnSubagent(args), true);
    tool(pi, "send_message", "给 Writer 发送消息。检查员和同步核对员不能接收消息。", toolContracts.send, (args) => hub.sendMessage(args), true);
    tool(pi, "stop_subagent", "停止一个正在运行的 Subagent。", toolContracts.stop, (args) => hub.stopSubagent(args), true);
    tool(pi, "get_subagents", "查看本任务的 Subagent 状态。", toolContracts.agent, (args) => hub.getSubagents(args));
  }
  if (role === "writer" && agentId) {
    tool(pi, "submit_plan", "提交工作目录中的 plan.md，不带参数。", toolContracts.empty, () => hub.submitPlan(agentId), true);
    tool(pi, "submit_draft", "提交工作目录中的 draft.md，不带参数。提交前必须已经提交过方案。", toolContracts.empty, () => hub.submitDraft(agentId), true);
  }
  if (role === "reviewer" && agentId) {
    tool(pi, "save_review", "提交这一份初稿的检查结果。review 是对象，不是 JSON 字符串。", toolContracts.reviewArgs, (args) => hub.saveReview(agentId, args), true);
  }
  if (role === "sync_checker" && agentId) {
    tool(pi, "query_canon", `只读${QUERY_CANON}用来核对变化是否与既有设定冲突。`, toolContracts.query, (args) => hub.queryCanon(args));
    tool(pi, "save_sync_check", "提交对当前变更清单的逐条核对结论，每条变更恰好一条。", toolContracts.syncCheck, (args) => hub.saveSyncCheck(agentId, args), true);
  }
}
