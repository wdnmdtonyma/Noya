# Noya 如何使用 Pi：包接口接入指南

日期：2026-09-25。性质：源码研究与示例，不是 Noya 的生产实现。

## 结论与核对范围

推荐先使用 `@earendil-works/pi-agent-core` 的 `AgentHarness`，配合 `@earendil-works/pi-ai` 的 Models/provider 和 `JsonlSessionRepo`。Context Agent 和 Writer 分别创建独立会话，由 Noya 应用代码传递经过校验的 Writing Package；不需要 fork Pi，也不需要引入 coding-agent 的默认编码环境。

本次实际读取的本地 HEAD 是 `ff72faba28d10c86611863d0aaa5d3122f2d8cb0`，不是上一份核对记录的 `71dca871bc`。研究期间没有更新或切换 Pi。目录中的包版本均为 `0.87.1`，但 npm 发布的 `0.87.1` 对应 `gitHead=f07218c4d4bbc12bef056a7058c3dd49dfe41abe`，早于本地 HEAD；不能只按版本号推断两者完全一致。本文结合本地源码和实际安装的发布包核对，不使用本地新增、未发布的接口。

本文完整 TypeScript 示例已针对 npm `0.87.1` 通过严格类型检查，但未调用真实 DeepSeek 模型。另用发布包的 faux provider 完成了八组隔离验证，详见第 5 节；这不等于 Noya 后端或真实写作质量已经验收。示例不依赖 `docs/pico`、`pico3` 或其他实验目录里的设计稿 API。

## 1. 需要哪些包

| 包/入口 | 使用内容 |
|---|---|
| `@earendil-works/pi-agent-core` | `AgentHarness`、`BACKGROUND_CONTEXT`、`JsonlSessionRepo`、工具及会话类型 |
| `@earendil-works/pi-agent-core/harness/env/nodejs` | `NodeExecutionEnv`：为 JSONL 存储提供 Node 文件系统实现 |
| `@earendil-works/pi-ai` | `createModels`：模型/provider 注册与认证解析 |
| `@earendil-works/pi-ai/providers/deepseek` | `deepseekProvider`：示例 provider，可替换为其他 provider |
| `typebox` | 为工具定义参数 schema；本地包依赖版本是 `1.3.27` |

Node 声明要求 `>=22.19.0`；示例采用 ESM/TypeScript。具体依赖版本和运行器应在首次工程接入时锁定，不根据这个示例自动修改 Noya 依赖。[agent package.json](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/agent/package.json)、[ai package.json](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/ai/package.json)、[公开导出](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/agent/src/index.ts)

首次工程接入可使用以下固定版本命令，并提交生成的 lockfile。本次只在独立临时目录安装，没有在 Noya 或 Pi 仓库中安装依赖：

```sh
npm install --save-exact --ignore-scripts @earendil-works/pi-agent-core@0.87.1 @earendil-works/pi-ai@0.87.1 typebox@1.3.27
```

`createModels()` 默认没有注册 provider。先 `models.setProvider(deepseekProvider())`，再查 `models.getModel("deepseek", modelId)`。DeepSeek provider 通过默认认证环境读取 `DEEPSEEK_API_KEY`；不要把密钥放进提示词、Writing Package 或 session。模型 ID 由调用方配置，并在注册表中检查，本文不指定写作模型。[Models](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/ai/src/models.ts:361)、[DeepSeek provider](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/ai/src/providers/deepseek.ts:6)、[默认认证环境](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/ai/src/auth/context.ts)

## 2. 最小接入代码

这是一个完整的接口示例文件：初始化 runtime、创建或恢复指定角色、注册只读工具、订阅文本增量、提交和驱动任务、读取结果、取消及清理。它只导出函数，不在加载模块时调用模型。

其中角色提示词很短，仅演示注入位置；不是最终的写作/审核提示词。示例 read 工具通过调用方提供的 ID → 文本映射读取资料，不是完整的 Noya 检索实现。

```ts
import { resolve } from "node:path";
import {
  AgentHarness,
  BACKGROUND_CONTEXT,
  JsonlSessionRepo,
  type AgentHarnessTool,
  type AgentLane,
  type JsonlSessionMetadata,
  type OpenOperation,
  type OperationResultRecord,
  type Session,
} from "@earendil-works/pi-agent-core";
import { NodeExecutionEnv } from "@earendil-works/pi-agent-core/harness/env/nodejs";
import { createModels } from "@earendil-works/pi-ai";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";
import { Type } from "typebox";
import { Value } from "typebox/value";

const ctx = BACKGROUND_CONTEXT;
const readParameters = Type.Object(
  { id: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
);

type Role = "context" | "writer";
type RoleHandle = {
  role: Role;
  session: Session<JsonlSessionMetadata>;
  harness: AgentHarness<undefined>;
  lane: AgentLane;
  open: OpenOperation[];
  unsubscribe: () => void;
};

export function createNoyaRuntime(options: {
  cwd: string;
  sessionsRoot: string;
  modelId: string;
  documents: ReadonlyMap<string, string>;
  onText?: (role: Role, delta: string) => void;
}) {
  const cwd = resolve(options.cwd);
  const env = new NodeExecutionEnv({ cwd });
  const repo = new JsonlSessionRepo({
    fileSystem: env,
    sessionsRoot: resolve(options.sessionsRoot),
  });
  const models = createModels();
  models.setProvider(deepseekProvider());
  const selectedModel = models.getModel("deepseek", options.modelId);
  if (!selectedModel) throw new Error(`Unknown DeepSeek model: ${options.modelId}`);
  const model = selectedModel;
  const handles: RoleHandle[] = [];

  const readContext: AgentHarnessTool<
    undefined,
    typeof readParameters,
    { sourceId: string }
  > = {
    name: "read_context",
    label: "Read context",
    description: "Read one work-context record by its known stable ID.",
    parameters: readParameters,
    prepareArguments(args) {
      // Reject malformed originals before Pi's argument coercion.
      if (!Value.Check(readParameters, args)) throw new Error("Invalid read_context arguments");
      return args;
    },
    replay: "safe", // Read-only operation; repeating it has no write side effect.
    async execute(_callId, args, _onUpdate, _toolContext, _invocation, context) {
      context.abortSignal?.throwIfAborted();
      const text = options.documents.get(args.id);
      if (text === undefined) throw new Error(`Unknown context ID: ${args.id}`);
      return {
        content: [{ type: "text", text }],
        details: { sourceId: args.id },
      };
    },
  };

  async function openRole(role: Role, existingSessionId?: string): Promise<RoleHandle> {
    let session: Session<JsonlSessionMetadata>;
    if (existingSessionId !== undefined) {
      const metadata = (await repo.list({ cwd }, ctx)).find(
        (item) => item.id === existingSessionId,
      );
      if (!metadata) throw new Error(`Session not found: ${existingSessionId}`);
      session = await repo.open(metadata, ctx);
    } else {
      session = await repo.create({ cwd }, ctx);
    }
    let harness: AgentHarness<undefined> | undefined;
    try {
      const attached = await AgentHarness.create<undefined>({
        session,
        models,
        model,
        systemPrompt: role === "context"
          ? "You are Noya's Context Agent. Distinguish confirmed facts, plans, and unknowns."
          : "You are Noya's Writer. Use the supplied Writing Package and explicit task stage.",
        resources: { skills: [], promptTemplates: [] },
        tools: [readContext],
        activeToolNames: [readContext.name],
        toolExecution: "sequential",
      }, ctx);
      harness = attached.harness;
      const lane = await harness.lane("main", ctx);
      const unsubscribe = harness.events.on("message_update", (event) => {
        if (event.event.type === "text_delta") {
          options.onText?.(role, event.event.delta);
        }
      });
      const handle: RoleHandle = {
        role, session, harness, lane, open: attached.open, unsubscribe,
      };
      handles.push(handle);
      return handle;
    } catch (error) {
      if (harness) await harness.close(ctx);
      else await session.close(ctx);
      throw error;
    }
  }

  async function readCompletedText(lane: AgentLane, outcome: OperationResultRecord) {
    if (outcome.status !== "completed") {
      throw new Error(`Operation ${outcome.status}: ${outcome.error?.message ?? outcome.operationId}`);
    }
    if (!outcome.tipId) throw new Error("Completed operation has no transcript tip");
    const entries = await lane.findEntries({
      start: outcome.tipId,
      ...(outcome.fromTipId ? { stopAtId: outcome.fromTipId } : {}),
      order: "newestFirst",
    }, ctx);
    for (const entry of entries) {
      if (entry.id === outcome.fromTipId) break;
      if (entry.type === "message" && entry.message.role === "assistant") {
        const text = entry.message.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("");
        if (text.length > 0) return text;
      }
    }
    throw new Error("No assistant text in this completed operation");
  }

  async function start(handle: RoleHandle, prompt: string) {
    const admitted = await handle.lane.accept({ kind: "prompt", prompt }, ctx);
    if (!admitted.ok) throw admitted.error;
    const operationId = admitted.value.operationId;
    // Returned separately so Noya can persist operationId and wire a Stop action
    // before starting execution. Accept is durable; it is not generation.
    return {
      operationId,
      drive: () => handle.lane.drive({
        operationId, waitForRetry: true, pollDeferred: true,
      }, ctx),
      cancel: () => handle.lane.requestAbort(operationId, ctx),
    };
  }

  async function recover(handle: RoleHandle) {
    // Reattach hooks/listeners and business tools before calling this.
    const results = [];
    for (const operation of handle.open) {
      const lane = await handle.harness.lane(operation.lane, ctx);
      const result = await lane.drive({
        operationId: operation.operationId,
        waitForRetry: true,
        pollDeferred: true,
      }, ctx);
      results.push({ lane, operationId: operation.operationId, result });
    }
    return results;
  }

  async function close() {
    // Closing releases runtime/session handles; it does not delete files.
    // Request and settle an explicit abort first when the author's intent is Stop.
    try {
      for (const handle of handles) {
        handle.unsubscribe();
        await handle.harness.close(ctx);
      }
    } finally {
      await repo.close(ctx);
      await env.cleanup(ctx);
    }
  }

  return { openRole, start, recover, readCompletedText, close };
}
```

调用流程示意（同样未执行）：

```ts
// runtime options supplied by Noya configuration; do not log API keys.
const runtime = createNoyaRuntime(options);
try {
  const context = await runtime.openRole("context");
  const writer = await runtime.openRole("writer");
  // Persist these IDs with their role/task identity in Noya's own task record.
  console.log(context.session.metadata.id, writer.session.metadata.id);

  // validatedPackageText comes from Noya's accepted Brief + selected Context Pack.
  // It is NOT the complete Context Agent transcript.
  const job = await runtime.start(writer, validatedPackageText);
  const result = await job.drive();
  if (!result.ok) throw result.error;
  if (result.value.kind === "settled") {
    const text = await runtime.readCompletedText(writer.lane, result.value.outcome);
    // Parse and validate the expected artifact for this task stage; persist a draft.
    // Do not finalize the chapter or sync canon merely because generation completed.
    console.log(text);
  } else {
    // Waiting is not success. Persist state and drive the SAME operation later.
    console.log(result.value.reason);
  }
} finally {
  await runtime.close();
}
```

`options` 和 `validatedPackageText` 是调用方输入，不是已存在的 Noya API。示例只定义接线位置，不假装已经实现资料选择和 schema 校验。`console.log` 仅示意，产品中应把正文和状态送给对应消费者。

接口依据：[Harness 与 lane 契约](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/agent/src/harness/agent-harness.ts:514)、[工具契约](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/agent/src/harness/types.ts:130)、[JSONL 仓库](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/agent/src/harness/session/jsonl/repo.ts:48)、[Node 文件系统](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/agent/src/harness/env/nodejs.ts:438)。

## 3. 必须正确理解的运行语义

### 会话、角色与正文是不同东西

- 一次 `repo.create` 得到一份新的 session；Harness 创建后还需要 `harness.lane("main", context)`，不存在自动创建的 main lane。
- Writer 使用新 session，而不是从 Context Agent 历史 fork；只传 Writing Package。正文质量复查和修订可以在该写作任务的 Writer 会话内继续。
- 示例两种角色都可调用只读资料工具，避免把“干净起点”误写成绝对禁止查询。真实产品应传入当前作品范围内的资料映射/读取器，不得使用全局混合作品库。
- Pi 的 `Context` 参数是执行上下文，包含取消与遥测，不是小说领域的 Context Pack。
- JSONL 保存运行记录，不替代正式章节、人物志、世界观等业务文件。[空 lane/独立配置测试](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/agent/test/harness/runtime/harness.test.ts)

### 结果不是字符串，也不是“ok 就写完了”

`lane.prompt(text, undefined, ctx)` 是便利入口。需要稳定 operation ID、中途停止和恢复时，使用 `accept → drive` 更明确。`accept` 只持久化受理；`drive` 才推进执行。

第一层判断 `result.ok`；第二层判断 drive 是 `settled` 还是 `waiting`；第三层判断 settled outcome 的 `status` 是否 `completed`。`failed`、`aborted`、`declined` 都不能当成功。即便 completed，Noya 仍需判断是否得到所需结构、是否被长度截断、是否通过质量门禁，不能仅凭运行结束就定稿。正文从 transcript/message 获取，不在 `OperationResultRecord` 里。[结果类型](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/agent/src/harness/session/types.ts:105)、[公共 drive 测试](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/agent/test/harness/runtime/drive-public.test.ts)

### Stop、关闭观察者、关闭 runtime 不等价

取消调用方的执行 Context，只取消该调用方的等待，不保证停止后台 operation。用户点“停止”时，应对明确的 operation ID 调用 `requestAbort`，检查返回结果，并让该 operation 的 drive 完成取消收尾；如果尚未 drive，取消后再 drive 一次即可处理终止。不要用“断开流式 UI”代替取消。

`harness.close` 封闭 runtime 并关闭它附着的 session，不应当作“用户确认取消”的记录。退出后想恢复未完任务，就保留 session 文件并在下次打开它；作者明确停止则记录 abort。`repo.close` 本身目前不负责关闭已打开 session，不能只调用它就认为释放完成。[关闭实现](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/agent/src/harness/runtime/harness.ts:323)、[取消与观察者测试](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/agent/test/harness/runtime/drive-public.test.ts)

### 恢复不是自动开跑，也不是自动恢复所有配置

启动后由 Noya 从任务记录找到 session ID，`repo.list → repo.open → AgentHarness.create`。create 返回 `open` 未结束操作列表，**不会自动调用 provider、工具或定时器**；应用恢复工具、提示词、事件监听、所需业务状态后，才调用对应 lane 的 drive。

lane 的模型身份、thinking level、active tools 等会恢复；provider 实例、认证、工具实现、system prompt、hook 和 runtime 级配置仍需应用重新提供。传入新的默认 model，不代表已存在 lane 会被切换；需要显式改变配置时调用 `lane.setModel`，并注意已受理 operation 的快照语义。保存 Noya 的角色/任务/提示词配置版本与 session 的关联，不把密钥放进去。[恢复入口](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/agent/src/harness/runtime/harness.ts:374)、[恢复测试](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/agent/test/harness/runtime/restore.test.ts)

### 工具重放不等于业务恰好执行一次

raw `AgentTool.execute` 的第三参数是 `AbortSignal`；Harness 工具第三参数是进度回调，取消信号在第六参数 `context.abortSignal`。不能直接照搬 raw Agent 的工具函数签名。

只读工具可声明 `replay: "safe"`。副作用工具默认 `never`；不能为了恢复方便就全部设 safe。Harness 的稳定 `invocation.invocationId`、memo、checkpoint 可用于实现重入，但“扣除资源/更新人物志/写回世界观”的幂等性和跨业务文件一致性仍由 Noya 保证。写入后尚未记录工具结果就崩溃，不能假设框架知道该写入是否完成。[raw 工具](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/agent/src/types.ts:444)、[Harness 工具](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/agent/src/harness/types.ts:113)、[重放实现](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/agent/src/harness/runtime/drive/tools.ts:527)

### 提示词与资源需要显式装配

通用 Harness 没有 coding-agent 的自动编码环境；未提供 `systemPrompt` 时是空字符串，resources 默认空对象。`resources.skills` 供技能入口等使用，并不意味着技能说明会自动拼进这里的 system prompt。需要模型看见的指令和资料，由 Noya 显式组织；不要把整个项目目录/聊天历史灌进去。[system prompt 解析](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/agent/src/harness/runtime/drive/generation.ts:55)

`watchSession()` 在当前实现仍抛 `SliceNotImplemented`，因此不能只按接口列表推断功能可用。先用已实现的 lane watch 或 events；事件监听不是跨重启的持久消息队列，断线恢复需读 snapshot/transcript。[未实现接口](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/agent/src/harness/runtime/harness.ts:303)

### Pi 的工具 schema 不是严格的业务文件校验

实际发布包验证发现：参数 schema 声明 `id: string` 时，模型传入 `{ "id": 123 }`，Pi 会转换为 `{ "id": "123" }` 并执行工具；缺少必填 id 则会被拒绝。源码也明确先做 optional-null 归一化与 `Value.Convert`，再检查 schema。[参数校验](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/ai/src/utils/validation.ts:317)

因此 Noya 的“不自动纠正类型”必须独立执行：

- 工具原始参数可以在 `prepareArguments` 中用不转换数据的 validator 检查，失败就抛错；已验证该入口能在 Pi 转换前拒绝数字 id。上面的 read 工具演示此做法。
- 若未来 `before_tool` hook 替换参数，也必须对替换值严格校验；不能仅在 execute 内检查类型，因为此时可能已经转换过。[工具准备与 hook 顺序](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/agent/src/harness/execution/tools.ts:78)
- 模型正文中的结构化产物、Brief/Pack、最终业务文件，仍需 Noya 在解析/交接/落盘边界分别校验；Pi 的工具 schema 不会替这些数据兜底。业务 schema 才是真正的数据契约。

## 4. 对 Noya 的最小落地顺序

1. 锁定发布依赖，用 faux provider 验证工具调用、JSONL 保存、关闭后恢复、显式取消和两个会话不共享历史。
2. 接通一个真实模型进行独立验收；这一步需要模型配置和实际调用，不包含在本次源码研究里。
3. 实现作品范围内的只读资料工具，再接 Brief/Pack/Plan 的校验与角色交接。
4. 接正文、四项门禁、具体反馈和修改后的整章复查；遵守已确认的“不设固定修改轮次上限”，不要借框架配置悄悄加回来。
5. 最后接作者定稿、资料同步及恢复幂等。技术执行 completed 不等于作者定稿，也不等于资料已同步。

以上是接入建议，不修改先前产品决策，不新增 Agent，也没有执行生产开发。

## 5. 发布包验证记录

环境：Node `v26.5.0`；`pi-agent-core`/`pi-ai` 固定 `0.87.1`，`typebox` 固定 `1.3.27`。在独立临时目录执行 `npm install --ignore-scripts --no-audit --no-fund`，没有读取 API key，没有真实模型调用。TypeScript `7.0.2`、`@types/node` `26.6.2` 用于示例检查。

以下八组检查全部通过（faux provider 是预设响应，不衡量模型能力）：

| 检查 | 实际确认 |
|---|---|
| 自定义工具和输出 | Harness 六参数 execute、流式 text delta、transcript 结果读取可用 |
| 两角色隔离 | 新 Writer 的模型输入不含 Context 的弃用讨论标记，仅收到显式传入的 package fixture |
| 会话恢复 | 关闭 Harness 后重新打开 JSONL，旧对话保留且可继续 |
| 未执行任务恢复 | accept 后关闭再打开，create 不调用模型；显式 drive 后完成 |
| 取消 | lane.abort 传递到正在运行的工具，结果为 aborted，未追加模型调用 |
| 必填参数缺失 | 缺少 id 时产生工具错误，不进入 execute |
| 类型转换 | 数字 id 被转换成字符串；这确认了宽松行为，不代表严格校验通过 |
| 转换前严格检查 | prepareArguments 看见原始数字并拒绝，未进入 execute |

完整示例执行了 `tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext guide-example.ts`，退出码 0。`skipLibCheck` 跳过依赖声明内部检查，不跳过示例对公开接口的类型检查。

边界：八组运行检查使用单独的诊断脚本，不等于上方 DeepSeek adapter 已做真实模型端到端验证；恢复检查是受控关闭/重开，不是进程强杀或磁盘故障测试；取消运行检查覆盖 lane.abort，指南的 requestAbort 用法经过源码和类型核对。尚未验证真实模型输出、长上下文压缩、并发业务写入或正式资料同步事务。
