# Pi 本地源码接入核对（2026-09-25）

## 范围与可信度

- 仅核对本地 `/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi`，HEAD 为 `71dca871bc80b6bc97be37f0ca3189399d651fff`，提交日期 2026-09-11，检查时工作树干净；**不是“最新上游”结论**。没有 fetch、安装、构建、运行模型或修改 Pi。
- 本地 `@earendil-works/pi-agent-core` 与 `@earendil-works/pi-coding-agent` 均为 `0.85.1`，Node 要求 `>=22.19.0`。不能仅凭旧笔记推断现有接口；包名相同不代表 SDK 签名和能力未变。[agent package](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/agent/package.json:2)、[coding-agent package](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/coding-agent/package.json:2)
- 这是源码接入面调查，不是 Noya 已实现、已验证恢复正确性或已验证写作质量的报告。下面的选型意见是基于源码的工程判断，不是已确认 ADR。

## 结论：不要把“基于 Pi”直接等同于 fork 整个 coding CLI

本地有三个不同层次，另有进程边界的 RPC。对于 Noya 的无前端、两个 Agent、独立写作上下文，**优先评估通用 `AgentHarness`，coding-agent SDK 是完整现成会话能力的备选；不建议直接从裸 `Agent` 重写所有恢复能力，也没有证据要求修改 Pi 源码。**

| 接入面 | 已有能力 | Noya 要承担或隔离什么 |
| --- | --- | --- |
| 裸 `Agent` | 消息状态、工具循环、流式事件、取消、消息转换/上下文变换钩子 | 这个类本身不是持久任务恢复器；需要另接存储和会话策略 |
| 通用 `AgentHarness` | session、lane、operation、accept/drive、恢复中的 operation、取消、工具/请求钩子、压缩、事件 | 提供模型、会话后端、角色提示词和业务工具；Noya 的写作工作流仍由 Noya 管理 |
| `createAgentSession` SDK | coding-agent 的现成会话、模型鉴权、工具注册、JSONL 历史、自动压缩和技术重试 | 显式剥离 coding 提示词、默认工具、机器上的全局/项目资源发现；不能把它的历史存储误当业务事务 |
| `pi --mode rpc` | stdin/stdout JSONL 命令和事件，适合跨语言或独立进程控制 | 仍是 coding-agent；业务工具通过扩展等服务端注册，不是往 prompt 塞函数；额外管理进程与协议 |

依据：[裸 Agent 选项与构造](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/agent/src/agent.ts:84)、[Harness 公共契约](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/agent/src/harness/agent-harness.ts:518)、[SDK 契约](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/coding-agent/src/core/sdk.ts:39)、[RPC 完整命令联合类型](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/coding-agent/src/modes/rpc/rpc-types.ts:21)。

## 通用 Harness 不再只是未落地草案

`AgentHarness.create()` 的公共实现确实调用 `restoreSession`，返回 `{harness, open}`。lane 公开 `accept`、`drive`、`requestAbort`、`inspectExecution`、`resume`，并不是仅有类型。创建与继续执行是不同操作，宿主需要决定是否驱动恢复出来的工作。[构造实现](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/agent/src/harness/runtime/harness.ts:375)、[lane 契约](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/agent/src/harness/agent-harness.ts:540)

`watchSession` 仍明确抛出 `SliceNotImplemented`，不能假设每个公共 API 都实现了；这不等于整个 Harness 没有实现。[未实现入口](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/agent/src/harness/runtime/harness.ts:305)

Harness 接受自定义 `systemPrompt`（字符串或函数）、`tools`、`toolContext`、`resources`、`toProviderMessages`，钩子包括 `transform_context`、`before_tool`、`after_tool`、`before_compaction`。这足以表达两个 Noya 角色和受控业务工具，不必借用 coding CLI 的身份。[配置](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/agent/src/harness/agent-harness.ts:518)、[钩子](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/agent/src/harness/agent-harness.ts:432)

注意工具和压缩等配置属于 Harness 层，lane 有自己的模型、thinking 与 active tools 配置。为了少做隐式共享，Noya 初版可用**Context 与 Writer 各自的 session/Harness**；这是建议，不是 Pi 强制，也不意味着一个 Harness 必须一个进程。[配置持有位置](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/agent/src/harness/runtime/harness.ts:41)

## 如果选 coding-agent SDK，具体可以怎样隔离

### 工具不是只能使用 read/bash/edit/write

`createAgentSession` 有 `customTools?: ToolDefinition[]`；本地版本的 `tools` 是 **工具名 `string[]` allowlist**，不是旧版本示例中的工具对象数组。默认会启用 `read/bash/edit/write`，所以 Noya 应传明确的业务工具名单。`tools: []` 会形成空 allowlist，也会排除自定义工具；只想关闭默认 builtin 而保留 custom 时可用 `noTools: "builtin"`。[SDK 参数](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/coding-agent/src/core/sdk.ts:52)、[默认名单](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/coding-agent/src/core/sdk.ts:256)、[名单实际作用于 custom 与 builtin](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/coding-agent/src/core/agent-session.ts:2694)

例如 Context Agent 使用检索/读节点/保存局部修订工具；Writer 使用交付章节方案/稿件等工具。工具的格式校验、作品范围、写入版本冲突和副作用幂等仍归 Noya；“传了 JSON Schema”不代表业务正确性已被 Pi 保证。

### 改 system prompt 仍不足以得到干净上下文

默认 loader 会发现全局及祖先目录的 AGENTS/CLAUDE 文件，还会加载 skills、prompts、extensions，以及 SYSTEM/APPEND_SYSTEM。它不是专门的小说资料加载器。[全局/祖先上下文发现](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/coding-agent/src/core/resource-loader.ts:119)、[loader 选项](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/coding-agent/src/core/resource-loader.ts:159)

可传自有 `ResourceLoader`，或显式配置 `DefaultResourceLoader`：关闭不需要的 extensions/skills/prompts/themes/context files，指定独立的 settings/agentDir，覆盖系统提示词并清空 append。`noExtensions` 等选项不会阻止调用方显式提供的额外路径/inline factories，不应混入作者机器上的配置。[实际资源处理](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/coding-agent/src/core/resource-loader.ts:452)、[系统/附加提示词处理](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/coding-agent/src/core/resource-loader.ts:515)

**自定义 system prompt 替换的是默认 coding 身份，仍会追加已加载 context files、skills（有相关读工具时）以及 cwd。**因此验收应检查最终送给模型的提示词/消息，而不是只检查配置写了 `systemPrompt`。[prompt 构造的 custom 分支](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/coding-agent/src/core/system-prompt.ts:48)

### 新 Writer 应新建，不应 fork Context 对话

`SessionManager.create(cwd, sessionDir)` 新建可持久化空会话；`inMemory()` 不落盘；`open(path)` 恢复指定会话，SDK 会恢复其消息。于是 Writer 可以“出生时只接收 Writing Package”，同时仍保存自己的方案、稿件和返修过程；干净起点不等于不持久化。[会话工厂](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/coding-agent/src/core/session-manager.ts:1546)、[SDK 消息恢复](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/coding-agent/src/core/sdk.ts:374)

`continueRecent()` 是“最近会话”，不适合作为 Noya 的角色/任务定位规则。`forkFrom()` 明确复制来源完整历史，也不适合从 Context 聊天创建干净 Writer。Noya 应保存 task/role 与 Pi session 的明确对应关系。[continue 与 fork](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/coding-agent/src/core/session-manager.ts:1584)

## 事件、取消、压缩和恢复边界

- SDK `session.subscribe()` 提供事件，内部在 `message_end` 保存消息；`await session.abort()` 会取消 retry/compaction/branch summary/agent 并等待 idle。程序退出后的业务恢复不是由一个内存 listener 自动完成。[订阅](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/coding-agent/src/core/agent-session.ts:848)、[取消](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/coding-agent/src/core/agent-session.ts:1637)
- SDK 默认自动压缩开启，保留预算为 reserve 16384/recent 20000；通用 Harness 的默认值也是如此。Noya 必须明确自己的策略，不能把“压缩聊天历史”当成“更新世界观/人物志”。[SDK defaults](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/coding-agent/src/core/settings-manager.ts:18)、[SDK 开关](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/coding-agent/src/core/settings-manager.ts:841)、[Harness defaults](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/agent/src/harness/compaction/compaction.ts:146)
- SDK 的上下文溢出压缩恢复最多尝试一次 compact-and-retry；普通技术 retry 默认开启、最多 3 次、基础延迟 2000ms。这些不是作者确定的“内容返修暂不设上限”，也不应未经适配就当成 Noya 的“同步失败立即重试”策略。[溢出恢复](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/coding-agent/src/core/agent-session.ts:2184)、[retry defaults](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/coding-agent/src/core/settings-manager.ts:914)
- Pi 会话消息/operation 的持久化，不自动提供“正文定稿 → 多个正式 Context 文件更新”的跨文件业务事务。稿件版本、旧检查失效、同步进度、重入和副作用幂等仍需 Noya 定义；无需为此冻结作者全部上下文。

## 对旧研究的修正

此前 8 月关于“core 的 durable harness 尚未实现，所以 Noya 必须自建相应能力”的判断，不能作为这个 9 月本地快照的结论。当前应该先复用和验证已有 `AgentHarness`。另一方面，源码出现实现并不证明它已经覆盖 Noya 的全部恢复语义；应以最小可运行闭环核验，不能直接把 Pi session 的可靠性等同于作品资料一致性。

建议的下一步是接入规格：选定 Harness 或 SDK、列出两个角色的工具和消息边界、明确 Pi session 与 Noya task/artifact 的映射，再用不调用付费模型的假 provider/工具验证新 Writer 无历史污染、取消与重启、定稿后资料同步重试。此调查本身没有执行这些验证。

## 与 LLM Wiki 和 Noya 设计的交叉核对

主 Agent 读取了 Wiki 的分层、SDK、Harness 生命周期和 JSONL 会话节点，并独立回查 Harness 公共契约、runtime 构造/restore、JSONL storage 实现。所读 Wiki 节点的 `updated` 为 `71dca871bc`，与本地 Pi HEAD 对应；这是本地一致性核对，不是重新验证全部 200 个 Wiki 节点，也未检查远端最新状态。[Wiki 入口](/Users/makii/Project/SOTA-Agent-LLM-Wiki/docs/llm-wiki/pi/README.md)、[Harness 节点](/Users/makii/Project/SOTA-Agent-LLM-Wiki/docs/llm-wiki/pi/subsystems/agent-core/agent-harness-lifecycle.md)、[JSONL 节点](/Users/makii/Project/SOTA-Agent-LLM-Wiki/docs/llm-wiki/pi/subsystems/agent-core/jsonl-storage.md)

会话后端并非必须自行实现或采用 SQLite：core 导出 `JsonlSessionRepo`，`JsonlStorage` 已实现会话事务追加、打开时重放，以及末尾未完成行的处理。`createAgentHarness` 则读取持久 lane/operation 状态并列出尚未结束的工作，但不会自行开始模型调用或工具副作用；Noya 的宿主仍须决定何时恢复执行。[公开导出](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/agent/src/harness/session/index.ts:15)、[JSONL 打开与追加](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/agent/src/harness/session/jsonl/storage.ts:74)、[恢复实现](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/agent/src/harness/runtime/restore.ts:92)、[无副作用挂载](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/agent/src/harness/runtime/harness.ts:375)

由此建议把开发范围区分如下，而不是重新设计整套通用 Agent 引擎：

| 归属 | Noya 中的用途 |
|---|---|
| 复用 Pi | 模型调用、工具循环、流式运行事件、取消、会话存储与运行恢复机制 |
| Noya 接入配置 | 两个角色的独立会话、提示词、工具和资源范围，选用的压缩/技术重试策略 |
| Noya 作品逻辑 | 七类结构化资料、索引与节点读取、Brief/Pack/Plan、章节检查与返修、作者定稿、资料同步 |

最后一行对应现有 [Context 类型](/Users/makii/Project/Noya/docs/design/context-types.md)、[存储设计](/Users/makii/Project/Noya/docs/design/context-storage.md)、[写作交接](/Users/makii/Project/Noya/docs/design/writing-brief.md)、[检查结果](/Users/makii/Project/Noya/docs/design/chapter-review.md) 和 [定稿/同步决策](/Users/makii/Project/Noya/docs/adr/0002-decouple-finalization-from-context-sync.md)。例如 Pi 记住一次工具执行，不等于已经保证人物志文件和伏线文件更新到同一章；其 JSONL 事务作用于会话存储，不自动覆盖 Noya 的独立作品文件。

因此，可以进入基于 Pi 的最小接入开发；不应先从零搭通用持久化 Harness。具体选择 `AgentHarness` 还是 coding-agent SDK 属于下一项接入决定，本报告优先推荐前者以减少 coding 产品默认行为，未把建议写成已接受的架构决策。用户所说“二次开发”若特指维护 Pi 源码 fork，还需明确必须修改上游的需求；现有 Noya 需求尚未显示这一必要性。
