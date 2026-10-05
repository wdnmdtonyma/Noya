import type { ExtensionContext, ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { registerFindTool } from "./find-tool.ts";
import { contextEditZones, contextReadZones, directoryZones, guardDecision, pathArgument, resolveToolPath } from "./guard.ts";
import { getHub } from "./hub.ts";
import { registerRoleTools } from "./tools.ts";
import type { RoleName } from "./config.ts";
import { refusal } from "./util.ts";

export const SWITCH_HINT = "退出后用 noya 命令开始新任务或继续任务";
export const STATUS_MARKER = "【子代理状态】";

export function createNoyaExtension(taskId: string, role: RoleName, workDir: string, agentId?: string): ExtensionFactory {
  return (pi) => {
    const hub = getHub(taskId, workDir);
    registerRoleTools(pi, hub, role, agentId);
    if (role === "context") registerFindTool(pi);
    pi.on("tool_call", (event) => {
      if (hub.isCancelled) return { block: true, reason: "作者已停止整个任务，请等待作者继续。" };
      const rawPath = pathArgument(event.toolName, event.input);
      if (rawPath === undefined) return undefined;
      const cwd = hub.cwdFor(role, agentId);
      let target: string;
      try {
        target = resolveToolPath(rawPath, cwd);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { block: true, reason: refusal(message) };
      }
      const zones =
        role === "context" && (event.toolName === "edit" || event.toolName === "write")
          ? contextEditZones(hub.editableFiles(), hub.work)
          : role === "context"
            ? contextReadZones(hub.work, hub.config.skillsDir, hub.task)
            : directoryZones(cwd, hub.work);
      const problem = guardDecision(target, zones);
      if (problem) return { block: true, reason: refusal(problem) };
      return undefined;
    });
    if (role === "context") {
      const showBillingSource = (_event: unknown, ctx: ExtensionContext) => {
        const subscriptionHistory = ctx.sessionManager.getBranch().some((entry) =>
          entry.type === "message" && entry.message.role === "assistant" && entry.message.provider === "openai");
        ctx.ui.setStatus("noya.billing", ctx.model?.provider === "openai" || subscriptionHistory
          ? "API 估算金额，非 ChatGPT 订阅扣费"
          : undefined);
      };
      pi.on("session_start", showBillingSource);
      pi.on("model_select", showBillingSource);
      pi.on("context", (event) => ({
        messages: [
          ...event.messages,
          {
            role: "custom" as const,
            customType: "noya.status",
            content: `当前写作任务：${hub.work.workId}/${hub.taskId}\n本任务产物目录：${hub.task.artifactsDir}\n正式资料目录：${hub.work.workDir}/canon\n读取方案、初稿和检查时使用上述产物目录中的实际文件路径；不能读取其他任务或从作品根递归搜索。\n${STATUS_MARKER}${hub.statusLine()}`,
            display: false,
            timestamp: Date.now(),
          },
        ],
      }));
      const blockSwitch = () => {
        pi.sendMessage({ customType: "noya.notice", content: SWITCH_HINT, display: true }, { triggerTurn: false });
        return { cancel: true };
      };
      pi.on("session_before_switch", blockSwitch);
      pi.on("session_before_fork", blockSwitch);
      pi.on("session_before_tree", blockSwitch);
      const tellAuthor = async (content: string, triggerTurn = false) => {
        await hub.contextSession?.sendCustomMessage(
          { customType: "noya.notice", content, display: true },
          triggerTurn ? { triggerTurn: true, deliverAs: "followUp" } : { triggerTurn: false },
        );
      };
      pi.registerCommand("finalize", {
        description: "把初稿定稿为正式章节",
        handler: async (args) => {
          try {
            await tellAuthor(await hub.finalize(args.trim()), true);
          } catch (error) {
            await tellAuthor(error instanceof Error ? error.message : String(error));
          }
        },
      });
      pi.registerCommand("stop", {
        description: "停止本任务所有正在运行的 Subagent",
        handler: async () => {
          await hub.stopAll();
        },
      });
      pi.registerCommand("compare", {
        description: "盲比同一 Writer 的第一版初稿和最新初稿",
        handler: async () => {
          try {
            await tellAuthor(hub.compare());
          } catch (error) {
            await tellAuthor(error instanceof Error ? error.message : String(error));
          }
        },
      });
      pi.registerCommand("compare-pick", {
        description: "记录对照比较的选择",
        handler: async (args, ctx) => {
          try {
            ctx.ui.notify(hub.comparePick(args.trim()), "info");
          } catch (error) {
            await tellAuthor(error instanceof Error ? error.message : String(error));
          }
        },
      });
    }
    if (agentId) {
      pi.on("agent_settled", () => {
        void hub.finishRound(agentId).catch(() => undefined);
      });
    }
  };
}
