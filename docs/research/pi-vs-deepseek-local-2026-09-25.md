# Pi 与 DeepSeek Harness：Noya 接入面比较（2026-09-25）

## 范围

本次 DeepSeek Harness 源码检查针对本地 `c291e7961a515f6d7af9304e7fd1d257929aef26`；Pi 对照依据同日的 [Pi 源码核对](/Users/makii/Project/Noya/docs/research/pi-local-source-audit-2026-09-25.md)，对应 `71dca871bc80b6bc97be37f0ca3189399d651fff`。本节是静态源码调查，未 fetch、安装、构建、跑测试或调用模型；不是最新上游、性能、稳定性或小说质量的实测结论。DeepSeek 仓库已有未跟踪 `deepseek-ai-collaboration-report.html`，未修改。

## 初步建议

对 Noya 当前“宿主程序掌控写作流程、两个独立角色、使用包而非维护 fork”的需求，优先 Pi 通用 `AgentHarness`。它把独立会话、模型、工具、提示词、取消和恢复直接交给宿主配置。DeepSeek Harness 也能实现需求，但要区分**外部 SDK**与**Cordis 内的插件集成**：前者简单启动但控制面较窄，后者能力完整却要求 Noya 加入它的插件装配与生命周期体系。这里比较的是接入工作量与职责适配，不是宣称 DeepSeek 能力弱或 Pi 已经足够稳定。

## DeepSeek 当前 SDK：旧结论哪些仍成立

| 问题 | 当前本地源码结论 |
|---|---|
| 能否 `await` 得到文本 | 能。已有 `DeepSeekHarness.run()`，从本条输入进入 durable inbox 的 receipt 收集到整个 Agent idle，返回 `finalResponse/events/notifications`。不能把“没有逐 prompt 因果结果”说成“没有获取最终文本的 API”。 |
| 结果是否严格属于一个 prompt | 不是。它取这段活动内最后一条根会话 assistant 文本；steering、注入或其他排队工作可能共同参与。不要把它包装为严格一请求一结果的业务事务。 |
| 能否通过 SDK 中途取消单个 turn | 当前 wire 不行。请求只有 `initialize`、`session/prompt`、`shutdown`；取消运行的外部手段是关闭该 runtime，不是局部取消。 |
| 接入是否同进程函数调用 | 官方 TS SDK 启动 `node dsh --profile ... --patch ...` 子进程，通过 stdio JSON-RPC 控制，不是将 Agent 嵌入调用方进程。 |
| 提供同一个 sessionId 是否等于重启恢复 | 不能这样理解。SDK server 对当前进程中的 Map 复用现有 Agent；不在 Map 则调用 `ctx.agents.create`，不是 `resume`。跨重启同 ID 不自动恢复磁盘会话，已存在的持久 ID 还可能碰到创建冲突。 |

直接依据：[run 实现](/Users/makii/Project/SOTA-Agent-LLM-Wiki/deepseek-harness/packages/sdk/client/src/api.ts:176)、[wire 请求集合](/Users/makii/Project/SOTA-Agent-LLM-Wiki/deepseek-harness/packages/sdk/protocol/src/types.ts:114)、[服务端实际 dispatch](/Users/makii/Project/SOTA-Agent-LLM-Wiki/deepseek-harness/packages/sdk/server/src/server.ts:246)、[子进程启动参数](/Users/makii/Project/SOTA-Agent-LLM-Wiki/deepseek-harness/packages/sdk/client/src/launch.ts:141)、[会话查找与创建](/Users/makii/Project/SOTA-Agent-LLM-Wiki/deepseek-harness/packages/sdk/server/src/server.ts:259)。

`run()` 默认新 session ID，同一 handle/显式 ID 可在仍运行的同一 runtime 内连续对话。SDK 初始化的 cwd/provider/model 是进程级；`run` 参数不包含角色系统提示词或 JS 工具回调。新 Writer 用新 ID 可避免复制 Context 对话，但两个角色的提示词/工具分离仍要配置对应 profile/plugin 或单独 runtime，不能只换 session ID 就认定隔离完成。[SDK 类型](/Users/makii/Project/SOTA-Agent-LLM-Wiki/deepseek-harness/packages/sdk/client/src/types.ts:27)、[新会话 handle](/Users/makii/Project/SOTA-Agent-LLM-Wiki/deepseek-harness/packages/sdk/client/src/api.ts:102)、[server 统一创建配置](/Users/makii/Project/SOTA-Agent-LLM-Wiki/deepseek-harness/packages/sdk/server/src/server.ts:274)

## 不要把 SDK 限制说成底层没有能力

DeepSeek 的 Cordis 运行时确实提供以下能力：

- `ctx.agents.create({setup, ...})` 可在公布 Agent 前装配角色范围内的工具、提示词、变量和监听器；不传 seed 即不用复制旧历史。`ctx.agents.resume({resumeSessionId, setup, ...})` 专门恢复持久会话。[创建/恢复类型](/Users/makii/Project/SOTA-Agent-LLM-Wiki/deepseek-harness/packages/core/agent/src/index.ts:89)
- `Agent.cancel(cause, {keepInbox?})` 中止当前活动，`whenIdle()` 等待收敛；这是真实底层能力，只是 SDK wire 没暴露。[公共接口](/Users/makii/Project/SOTA-Agent-LLM-Wiki/deepseek-harness/packages/core/agent/src/runtime-types.ts:176)、[实现](/Users/makii/Project/SOTA-Agent-LLM-Wiki/deepseek-harness/packages/core/agent-loop/src/agent.ts:149)
- `systemPrompt.section` 可注册 `complete` 角色提示词；runtime context 可单独抑制，工具可在 Agent scope 注册/限制。完整 system prompt 不意味着其他输入自动消失，应检查最终模型输入与工具集。[提示词声明](/Users/makii/Project/SOTA-Agent-LLM-Wiki/deepseek-harness/packages/core/system-prompt/src/index.ts:50)、[上下文抑制](/Users/makii/Project/SOTA-Agent-LLM-Wiki/deepseek-harness/packages/core/system-prompt/src/index.ts:500)、[工具注册/限制](/Users/makii/Project/SOTA-Agent-LLM-Wiki/deepseek-harness/packages/core/tools/src/index.ts:1021)

因此，若选择 DeepSeek，不一定要 fork：可以把 Noya 集成写成自有 Cordis 插件，通过自有 profile/patch 装配。但这和 Pi 直接提供通用 Harness 配置的开发体验不同，需要维护一套插件装配、scope、生命周期及必要的宿主控制入口。

也不能笼统说 DeepSeek 一定拉起整套编码产品：当前 `sdk-minimal` 明确不继承 `dsh-base`，可覆盖 persona，并关闭默认 Harness identity/runtime context。不过它仍有 shell、持久化等自有组合，默认 persona 仍是软件工程助手；Noya 必须显式裁剪和替换，而不是原样拿来写小说。[minimal profile](/Users/makii/Project/SOTA-Agent-LLM-Wiki/deepseek-harness/packages/bundle/sdk-minimal/cordis.patch.yml:1)、[默认 persona](/Users/makii/Project/SOTA-Agent-LLM-Wiki/deepseek-harness/packages/bundle/sdk-minimal/cordis.patch.yml:84)

## 恢复语义与业务副作用

DeepSeek 的底层恢复不是空壳。AgentLoop 打开持久 write handle、读取日志，为中断 turn 追加 synthetic closers，然后恢复 session：没有开始的 tool 标记 `TOOL_NOT_STARTED`；已经记录开始但无持久结果的 tool 标记 `TOOL_OUTCOME_UNKNOWN`，明确要求先核实副作用，不能盲目重复执行。[恢复实现](/Users/makii/Project/SOTA-Agent-LLM-Wiki/deepseek-harness/packages/core/agent-loop/src/index.ts:844)、[中断结果修补](/Users/makii/Project/SOTA-Agent-LLM-Wiki/deepseek-harness/packages/core/session/src/repair.ts:93)

这能恢复可继续使用的对话，不等于从被打断的执行指令精确续跑，更不提供 Noya“定稿→人物志/世界观/伏线同步”的跨文件 exactly-once。Pi 的会话事务也不自动覆盖作品文件。两者之上都仍需 Noya 的稿件版本、检查失效、同步进度、幂等写入和恢复决策。用户要求技术故障立即重试，不意味着已经发生过的业务副作用可以无条件再执行一次。

## 对 Noya 的选择边界

- **继续 Pi**：当前没有依赖 DeepSeek 特有平台能力的需求；重点是尽快验证干净 Writer、受控工具、章节检查和作品同步。
- **重新考虑 DeepSeek**：当产品确实需要大量动态插件组合、Agent scope、现成运行时平台能力，且愿意以 Cordis 插件应用为主要开发方式时，再评估它是否减少整体工作量。
- **不要用框架选型替代写作质量验证**：两套引擎都不自动解决资料选择、人物动机判断或作者满意度；目前没有同任务/同模型的效果测试，不能据源码宣称谁写得更好。

本报告尚未把比较建议写成已接受的 ADR；用户已同意优先复用 Pi 包、无法满足时再考虑源码修改，是否因这次比较更换底座仍由用户决定。

## 综合结论与官方在线抽查

**推荐 Noya MVP 继续使用 Pi，优先验证通用 AgentHarness 的包接入。**理由是当前需要宿主直接管理两个固定角色、设置材料与工具、取消运行并恢复任务；Pi 的接口配置方式更直接。DeepSeek 的优势是把工具、角色、运行时服务和子代理组织成可替换的插件应用，这种扩展方式有价值，但当前需求尚不足以抵消额外的装配与接入工作。这个判断不涉及包数量、启动时间、内存或生成质量的优劣；本次没有测量这些指标。

主 Agent 同时抽查了 2026-09-25 可访问的官方页面，不将本地 SHA 冒充最新发布版：

- [DeepSeek 官方仓库说明](https://github.com/deepseek-ai/deepseek-harness#developer-preview) 仍将项目标为快速迭代的 developer preview，并提示兼容性破坏；这不构成 Pi 已稳定的反向证明。
- [DeepSeek 官方 SDK 文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/sdk/client/README.md#known-limitations-and-deferred-work) 与本地重点限制一致：有 `run()` 活动区间结果，没有 wire 级 mid-turn cancel。在线文档核对不替代本地 server/source 证据。
- [Pi 官方 Harness 契约](https://github.com/earendil-works/pi/blob/main/packages/agent/src/harness/agent-harness.ts) 仍提供宿主可配置的会话、模型、工具、提示词与运行控制入口；是否满足 Noya 恢复需求仍需接入测试。

模型选择与 Harness 选择分开。Pi 本地已有 [DeepSeek provider](/Users/makii/Project/SOTA-Agent-LLM-Wiki/pi/packages/ai/src/providers/deepseek.ts:6)，DeepSeek Harness 也有 [pi-ai 适配器依赖](/Users/makii/Project/SOTA-Agent-LLM-Wiki/deepseek-harness/packages/llm/llm-pi-ai/package.json:43)。因此“准备用 DeepSeek 模型”本身不是必须选择 DeepSeek Harness 的理由；两边对供应商特性的具体覆盖不能据此宣称完全相同。

主 Agent 还核对了 Wiki 的 sdk-minimal 页面与实际组合文件：该 Wiki 页的表格残留 `fs-local` 行，而当前 [cordis.patch.yml](/Users/makii/Project/SOTA-Agent-LLM-Wiki/deepseek-harness/packages/bundle/sdk-minimal/cordis.patch.yml) 没有该行。本次比较以源码为准，未修改 Wiki。

下一步建议只实现 Pi 的最小接入验证：新建两份独立角色会话、交接明确材料、挂一个 Noya 工具、观测并取消运行、恢复指定会话。不同时接入两个框架，也不先建设复杂的通用适配层。此处仅建议后续工作，本次未执行验证。
