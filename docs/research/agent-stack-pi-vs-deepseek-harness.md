# Noya MVP Agent 技术选型：Pi vs DeepSeek Harness

日期：2026-08-17

## 一句话结论

MVP 选 **Pi 的 `@earendil-works/pi-agent-core` + `@earendil-works/pi-ai`**，但只把它当“模型调用、工具循环和事件流”使用；任务状态、干净 context、断点恢复、等待作者决定、原子定稿和历史回退全部由 Noya 自己掌握。

不要直接嵌入整套 Pi coding-agent，也不要使用 Pi 尚未完成的 durable `AgentHarness`。现阶段也不建议让 Noya 建在 DeepSeek Harness 之上：它的能力更完整，但会把 MVP 带进 Cordis 插件体系、事件溯源和自定义宿主集成；而最省事的进程外 SDK 路径恰好没有 Noya 必需的“中途停止”和“逐次任务结果”。

这是一个面向 **MVP 交付速度** 的判断，不是说 Pi 在所有维度都比 DeepSeek Harness 强。若以后 Noya 需要第三方插件、远程沙箱、通用审批、跨进程多 Agent、长期运行任务或可替换的完整能力后端，DeepSeek Harness 值得重新评估。

## 研究范围

本结论基于本机 `SOTA-Agent-LLM-Wiki` 中固定的上游源码快照，并逐项回查了官方仓库的 README、架构文档和实现：

- Pi：[`086c32e74530564922d011ade23ff582c9d63116`](https://github.com/earendil-works/pi/commit/086c32e74530564922d011ade23ff582c9d63116)，本地描述为 `v0.84.2-6-g086c32e74`。
- DeepSeek Harness：[`47f943859bef60e4160492346772ded9b24f765a`](https://github.com/deepseek-ai/deepseek-harness/commit/47f943859bef60e4160492346772ded9b24f765a)，根包版本为 `0.1.0-rc.5`。
- Noya 需求基线：[MVP PRD](../prd/noya-mvp/prd.md) 与 [决策记录](../prd/noya-mvp/prd.yaml)。

下面明确区分“源码事实”和“面向 Noya 的推断”。

## Noya 真正需要 Harness 解决什么

以下是 PRD 已经明确的事实，不是对通用 Agent 产品的想象：

1. **一件工作一条执行记录，context 从书中重新组装。** 排章、写章、改稿、改资料不能依赖一条不断增长的聊天历史；没接受的试探和废案也不能污染下一次任务。见 [PRD 4.6](../prd/noya-mvp/prd.md#46-按当前任务准备写作材料) 和 [决策记录第 78—89 行附近](../prd/noya-mvp/prd.yaml#L78)。
2. **右栏要展示真实执行过程。** 作者应看到查找、阅读、工具、生成、检查、等待决定、完成/失败/停止及具体改动，但不看隐藏推理。见 [PRD 4.2](../prd/noya-mvp/prd.md#42-回到作品并继续上次工作)。
3. **停止、退出和恢复是产品语义。** 停止保留已接受安排和已写初稿；刷新、退出、切书不等于取消；回来要恢复安全检查点。见 [PRD 4.2](../prd/noya-mvp/prd.md#42-回到作品并继续上次工作)。
4. **定稿是 Noya 领域事务。** 正文、世界志、人物志、资料库、伏线和历史要么一起生效，要么都不生效；定稿中断要回到未定稿初稿。见 [PRD 4.4](../prd/noya-mvp/prd.md#44-修改初稿并完成定稿)。
5. **等待作者决定必须持久。** 冲突或关键新发明出现时，同一任务停在原步骤；作者稍后回来回答后继续。见 [PRD 4.2](../prd/noya-mvp/prd.md#42-回到作品并继续上次工作) 与 [PRD 4.4](../prd/noya-mvp/prd.md#44-修改初稿并完成定稿)。
6. **作品事实和执行记录是两套东西。** 书中的纯文本文件是长期权威内容；Agent 执行记录只解释一次工作做了什么。作品历史和影响回退必须以正文/资料版本为准，而不是以模型 transcript 为准。见 [PRD 4.7](../prd/noya-mvp/prd.md#47-修改旧事实并整体回退)。

因此，最关键的选择标准不是“哪个 Harness 自带功能最多”，而是：谁能以最少阻力嵌入 Noya 的任务模型，同时不把模型聊天历史误当成作品事实。

## 源码事实：Pi

### 已经可用的部分

- `pi-agent-core` 是通用的有状态 Agent 循环，提供工具调用和事件流；官方把 `pi-ai`、`pi-agent-core` 和 coding-agent 分成独立包。[Pi 根 README](https://github.com/earendil-works/pi/blob/086c32e74530564922d011ade23ff582c9d63116/README.md#L13-L34)
- `Agent` 支持在每次模型调用前用 `transformContext` 修剪或注入外部 context，并允许应用自定义消息类型。这个接口与 Noya “每件工作重新从文件组装材料”的方向相容。[Agent Core README](https://github.com/earendil-works/pi/blob/086c32e74530564922d011ade23ff582c9d63116/packages/agent/README.md#L45-L64)
- `Agent` 会发出 `agent/turn/message/tool_execution` 的开始、增量和结束事件；工具还能流式上报进度。这些事件足够驱动 Noya 右侧执行轨的底层状态。[Agent Core README](https://github.com/earendil-works/pi/blob/086c32e74530564922d011ade23ff582c9d63116/packages/agent/README.md#L65-L174)
- `Agent` 有 `abort()`、`waitForIdle()`、`beforeToolCall`、`afterToolCall`，并允许顺序或并行执行工具。[Agent Core README](https://github.com/earendil-works/pi/blob/086c32e74530564922d011ade23ff582c9d63116/packages/agent/README.md#L113-L146)；[控制 API](https://github.com/earendil-works/pi/blob/086c32e74530564922d011ade23ff582c9d63116/packages/agent/README.md#L313-L328)
- coding-agent SDK 明确支持嵌入 Web、桌面和移动应用，也支持替换 system prompt、关闭内建工具并注册自定义工具。[SDK](https://github.com/earendil-works/pi/blob/086c32e74530564922d011ade23ff582c9d63116/packages/coding-agent/docs/sdk.md#L3-L14)；[自定义 prompt / tools](https://github.com/earendil-works/pi/blob/086c32e74530564922d011ade23ff582c9d63116/packages/coding-agent/docs/sdk.md#L501-L606)
- `pi-ai` 本身支持 DeepSeek、OpenAI、Anthropic、Google、OpenRouter 以及自定义 OpenAI-compatible API；选 Pi 不等于绑定某一个模型提供商。[Pi AI providers](https://github.com/earendil-works/pi/blob/086c32e74530564922d011ade23ff582c9d63116/packages/ai/README.md#L57-L102)
- 官方发布包有独立版本号，当前快照的 `pi-agent-core` 为 `0.84.2`。[package.json](https://github.com/earendil-works/pi/blob/086c32e74530564922d011ade23ff582c9d63116/packages/agent/package.json#L1-L21)

### 不能误判为已完成的部分

- Pi 新的 durable `AgentHarness` **尚不可用**。当前实现中，已有 session 直接触发 `HarnessNotImplemented("create.restore")`，而 `prompt`、`compact`、`resume`、`abort`、队列、`watch` 等主要方法都返回 `HarnessNotImplemented`。[实际源码](https://github.com/earendil-works/pi/blob/086c32e74530564922d011ade23ff582c9d63116/packages/agent/src/harness/agent-harness.ts#L347-L442)
- Pi coding-agent 的 JSONL session、分支和 compaction 是“对话会话”能力，不会自动实现 Noya 的章节任务状态、跨资料原子定稿或影响回退。[Pi sessions](https://github.com/earendil-works/pi/blob/086c32e74530564922d011ade23ff582c9d63116/packages/coding-agent/docs/sessions.md#L1-L20)；[session format](https://github.com/earendil-works/pi/blob/086c32e74530564922d011ade23ff582c9d63116/packages/coding-agent/docs/session-format.md#L306-L342)
- Pi 没有内建文件、进程、网络或凭证权限沙箱；默认拥有启动进程的用户权限。官方建议需要强隔离时使用容器、VM 或策略沙箱。[Pi 权限说明](https://github.com/earendil-works/pi/blob/086c32e74530564922d011ade23ff582c9d63116/README.md#L38-L46)

## 源码事实：DeepSeek Harness

### 它明显更强的部分

- DeepSeek Harness 的会话是 append-only typed event log；模型历史、UI replay、fork、resume 和 telemetry 都从同一个日志派生。它还要求所有 model-visible 输入都能从日志重建。[架构：Session log](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/architecture.md#L92-L102)
- 每个 turn、step、assistant chunk、tool call/result 都是 durable session event，天然适合高保真的执行轨回放。[架构：Turn flow](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/architecture.md#L63-L90)
- Session persistence 有 flush checkpoint 和 crash repair。冷启动发现未闭合 turn 时，会保留已落盘事件并追加 synthetic `interrupted` 结束事件。[Persistence](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/subsystems/persistence.md#L5-L19)
- 同进程 `Agent` API 有 `cancel()`、持久 inbox、`followup`、`steer`、`inject` 和 `whenIdle()`。[Core Agent API](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/subsystems/core.md#L53-L155)
- 它已经有 provider-neutral 的用户提问、一次性审批、权限 preset、文件系统策略、sandbox、subagent 和后台工作等能力。人类提问可以带选项、详情和可扩展的 presentation intent。[User Interaction](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/subsystems/user-questions.md#L1-L84)；[User Approval](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/subsystems/approval.md#L1-L46)；[官方 package 能力图](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/README.md#L11-L57)
- DeepSeek 官方 adapter 对 thinking、reasoning passback、retry、错误分类和大 context 做了深入适配；同时它另有基于 `pi-ai` 的通用多 provider adapter。[DeepSeek adapter](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/llm/llm-deepseek/README.md#L1-L48)；[pi-ai adapter](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/llm/llm-pi-ai/README.md#L1-L9)

### 对 Noya MVP 不利的事实

- 整个系统建立在 Cordis 上，“everything is a plugin”；model adapter、tool registry、session log、agent loop 都是插件，运行时还要组合 profile、bundle 和 patch layer。[架构](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/docs/architecture.md#L9-L37)
- 官方仍明确标记为 **developer preview**，并承诺会有兼容性破坏。[根 README](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/README.md#L5-L23)
- 如果 Noya 走 TypeScript 进程外 SDK 路径，它当前 **没有 mid-turn cancel，也没有逐 prompt result/cancel**；放弃运行只能关闭整个 runtime。SDK 的 client→server notifications 和 server→client requests 也尚未实现，限制了跨进程的人机审批流。[SDK Known Limitations](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/sdk/client/README.md#L44-L49)
- SDK 的高层 `run()` 返回的是“从消息入队到下一次 whole-agent idle”这一活动区间的最后回复，并不保证因果上属于那条 prompt。[SDK result semantics](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/sdk/client/README.md#L24-L30)
- JSONL session persistence 的 crash recovery 是“保留事件并标记中断”，不是“自动恢复 Noya 原步骤继续执行”；当前持久化格式还是 v0、无迁移，且 session 文件没有删除 API。[JSONL durability / limitations](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/session/session-persistence-jsonl/README.md#L40-L76)

## 面向 Noya 的推断

以下评分是从上述事实推导出的工程判断，5 表示更适合当前 MVP，不代表通用质量高低。

| 选型项 | Pi core + pi-ai | DeepSeek Harness | 判断依据 |
|---|---:|---:|---|
| 每件工作使用干净、冻结的 context | 5 | 3 | Pi 可以每次新建 `Agent` 并直接传入任务材料；DSH 默认从 session log 派生历史，需要“一任务一 session”或定制 pre-step 才能避免旧对话进入模型。 |
| 驱动 Noya 自定义执行轨 | 4 | 5 | 两者都有细粒度事件；DSH 的 durable chunk/event replay 更完整。 |
| “停止并保留已写内容” | 5 | 3 | Pi 直接嵌入时有 `abort()`；DSH 同进程有 `cancel()`，但进程外 SDK 没有 mid-turn cancel。 |
| 等待作者决定 | 3 | 4 | DSH 同进程已有 user-questions seam；Pi 需要 Noya 自己做持久 decision request。若走 DSH SDK，跨进程交互优势又会明显下降。 |
| Agent transcript 持久化与 crash repair | 2 | 5 | DSH 明显更成熟；Pi 可用 session 主要来自 coding-agent，而新的 durable harness 尚未完成。 |
| Noya 多文件原子定稿与影响回退 | 2 | 2 | 两者都没有小说领域事务；都必须由 Noya 实现。DSH 的 session 原子性不能替代作品文件的整体提交。 |
| 权限、sandbox、通用审批 | 2 | 5 | DSH 有完整 seam；Pi 明确没有内建 sandbox。 |
| 模型供应商与 DeepSeek 支持 | 5 | 5 | Pi 原生多 provider；DSH 的通用 adapter 本身也基于 pi-ai，并另有 DeepSeek 官方 adapter。 |
| MVP 集成和理解成本 | 5 | 2 | Pi core 是小型库接口；DSH 要先承担 Cordis、profile/bundle、session event vocabulary、宿主/客户端边界。 |
| 当前兼容性风险 | 4 | 1 | Pi 有连续版本发布；DSH 根 README 明确说明 developer preview 和 breaking changes。 |

### 为什么最终选 Pi

Noya 最难的不是通用 Agent 循环，而是三个产品语义：

1. **把一次工作需要的事实正确组装出来；**
2. **让草稿、等待决定和停止点可以恢复；**
3. **让定稿涉及的多份作品内容整体生效并可回退。**

这三件事都必须由 Noya 自己拥有。既然不能外包给任一 Harness，MVP 更适合选择较薄的 Pi core，把有限工程量花在 Noya 自己的领域状态和验证上，而不是先建立一套通用插件平台。

DeepSeek Harness 的优势主要在“通用 Agent 基础设施完整度”，但其中相当一部分对 MVP 是暂时多余的：通用 shell/terminal/LSP、远程 sandbox、自修改插件、通用 workflow、复杂 subagent provider、Web UI 插件系统。Noya 的界面和任务模型已经非常具体，复用它的通用 Web Chat 也不会省掉核心产品开发。

## 推荐的 MVP 落法

### 1. 依赖边界

只引入：

- `@earendil-works/pi-agent-core`
- `@earendil-works/pi-ai`
- 首发实际需要的 provider 子路径；不要一次打包全部 provider。

不要在 MVP 主链路中使用：

- Pi CLI/TUI；
- coding-agent 默认的 bash/read/edit/write 工具体系；
- 当前未完成的 `AgentHarness`；
- 把 Pi JSONL conversation session 当成 Noya 作品数据库。

### 2. 一件工作一个临时 Agent

每次排章、写章、改稿或改资料时：

1. Noya 创建一个 `TaskRun`，固定 `bookId / objectId / taskType / sourceRevision`。
2. `ContextAssembler` 从已定稿正文和资料中生成一份冻结的 `ContextBundle`。
3. 用该 bundle、作者本次要求和少量任务工具创建新的 Pi `Agent`；不要带入上一件工作的 messages。
4. 运行结束后保存 transcript 供执行轨回看，但 transcript 不参与下一件工作的 context。

这比在一个长 conversation 上持续 compaction 更符合 PRD，也直接消除了“废案还躺在历史里”的主要污染源。

### 3. 只给领域工具，不给任意文件能力

建议首批工具保持窄且可审计，例如：

- `search_book_context(query, kinds, chapterRange)`
- `read_book_item(ref)`
- `save_draft_checkpoint(text, cursor)`
- `propose_book_changes(changes[])`
- `request_author_decision(question, options, impact)`
- `finish_task(summary)`

Agent 不直接获得 bash，也不直接获得任意路径 write/edit。所有文件引用先通过 `bookId + logicalRef` 解析，并强制落在当前书目录。这样可以在 MVP 阶段显著降低 Pi 缺少 sandbox 的风险；若以后开放任意插件、联网或 shell，再引入进程级沙箱。

### 4. “等待决定”不是挂起一个 Promise

`request_author_decision` 应当：

1. 把问题、选项、影响对象和当前 task checkpoint 写入 Noya store；
2. 将任务置为 `waiting_for_user`；
3. 结束当前 Agent run；
4. 作者回答后，从冻结 checkpoint + 答案创建下一次短 run。

这样退出应用或进程崩溃都不会丢问题，也不会依赖一个长期存活的 Node Promise。

### 5. 停止和恢复由 Noya checkpoint 驱动

- Pi 的 token/tool 事件用于实时执行轨；生成正文时按段或按时间写入 `draft checkpoint`。
- 作者点击停止时先调用 `agent.abort()`，然后等当前持久化队列收敛。
- 重启后根据 `TaskRun.phase` 恢复：写作中断显示已有初稿并允许继续；定稿中断回到未定稿初稿重新检查。
- 不尝试从半截模型 reasoning 恢复；从最后一个领域 checkpoint 重新发起一个干净步骤。

### 6. 定稿使用 Noya 自己的事务日志

Agent 只提交 `ProposedChangeSet`，不直接宣布定稿成功。Noya 应：

1. 校验 source revision 和影响范围；
2. 将正文、资料、摘要和索引的新版本写入 staging；
3. 记录一条包含全部前后版本的 commit manifest；
4. 发布 manifest 指向的新版本；
5. 最后把 TaskRun 标为 finalized。

重启时只认完整 commit manifest；不完整 staging 可清理或重放。这样才能兑现“要么一起生效，要么都不生效”，而不是把希望寄托在 Agent transcript 上。

## 必做验证 Spike

在正式铺 UI 前，用一个极小 vertical slice 验证以下六点：

1. 同一章先否掉方案 A，再启动新的写章任务，确认模型 context 中完全没有 A。
2. 流式生成一章时点击停止，确认已形成的正文 checkpoint 保留，下一次可以继续。
3. 在 `waiting_for_user` 时杀掉进程，重启后仍能看到问题并从同一任务继续。
4. 在定稿写入任意中间点模拟崩溃，重启后只能看到“全旧”或“全新”，不能出现一半资料已更新。
5. 右侧执行轨能从保存的 Noya execution events 完整重放，而不依赖 Pi 内存对象。
6. 同一个任务分别跑 DeepSeek 和第二个 provider，领域输出格式和工具行为不变。

如果这个 slice 里大部分时间都耗在重造通用审批、事件路由、沙箱或多 Agent 调度，而不是 Noya 的 context 与事务，那么再用同一组验收场景做一次 DeepSeek Harness 同进程插件 spike；不要改用当前缺少 stop 的进程外 SDK 路径。

## 何时重新考虑 DeepSeek Harness

满足以下任意两三项时，重新评估会更合理：

- Noya 要开放第三方插件或让不同能力按配置热插拔；
- 需要 E2B/本地 sandbox、shell、terminal、LSP 等统一切换执行后端；
- 需要大量可恢复 subagent、后台 job、workflow 或跨产品 delegation；
- 需要把完整 agent event log 作为外部协议和审计事实；
- DeepSeek Harness 退出 developer preview，并且 TypeScript SDK 提供 mid-turn cancel、逐 prompt 结果和完整双向交互；
- 团队愿意把 Cordis plugin model 当长期架构，而不只是为了借一个 agent loop。

在这些条件出现前，Pi core 更像 Noya 需要的“薄引擎”；DeepSeek Harness 更像一套需要共同采用的“Agent 应用平台”。对当前 MVP，前者的边界更合适。
