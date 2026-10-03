# Noya v0 迭代：通过 Pi 使用 ChatGPT 订阅

Status: ready-for-agent

日期：2026-10-03。范围按作者反馈收缩：本地自用、一个订阅账号、一个 Noya 进程。目标是跑通既有写作流程。

测试继续采用作者确认的边界：现有写作流程 fixture 与共享 ModelRuntime，模拟必要的 OAuth／Responses 外部行为，最后进行一次真实订阅验收。

## Problem Statement

作者想用已有 ChatGPT 订阅试跑 Noya。当前角色配置只接受 DeepSeek，Pi 0.87.1 也没有新的订阅调用路径。

这一轮只需要回答：能否用订阅模型完成 Noya 的工具调用、章节生成、正文检查和既有任务续写。上一版引入的独立客户端注册、多账号管理、跨进程刷新协调和用量界面，超出了这个验证目标。

## Solution

升级 Pi，直接复用其 Sign in with ChatGPT 登录、凭证保存、安装标识和刷新能力。作者在 Noya 的 Pi 交互界面使用 /login openai 选择订阅登录，在现有角色配置中选择 OpenAI 模型；四个角色共用现有 ModelRuntime。

只在 Noya 的模型请求边界补足 SDK 与官方订阅协议的实际缺口，并跑通一条真实短章流程。默认 DeepSeek 配置继续可用。

本期授权界面使用 Pi 的客户端名称。Noya 说明自己通过 Pi 使用订阅，不提供独立的 Noya 账号体系，也不要求新增 Noya 专属客户端注册、账号展示或重新登录复用逻辑。

## User Stories

1. 作为作者，我想通过现有 Pi 登录入口授权 ChatGPT 订阅，以便开始试用。
2. 作为作者，我想重启后复用 Pi 保存的凭证，以便正常继续写作。
3. 作为作者，我想在现有角色配置中选择 OpenAI 模型与 thinking，以便试跑不同模型。
4. 作为作者，我想四个角色共用一次授权，以便不必逐个登录。
5. 作为作者，我想订阅模型能实际调用 Noya 工具，以便准备资料、派发 Writer 和保存产物。
6. 作为作者，我想 Writing Agent 仍只收到 Writing Package，以便接入不会污染正文上下文。
7. 作为作者，我想正文检查员和同步核对员继续按既有流程运行，以便接通整条链路。
8. 作为作者，我想中断后继续已有写作任务，以便保留对话与产物。
9. 作为作者，我想未登录、模型不可用或额度不足时看到错误，以便处理后再继续，而不是自动改用付费 API key。
10. 作为作者，我想断流或未完成的响应被标为失败，以便不把半截结果当作成功交稿。
11. 作为作者，我想凭证不进入模型输入、作品和 Git 历史，以便安全地使用本地项目。
12. 作为作者，我想有一次真实短章验收，以便确认接入可用。

## Implementation Decisions

### 1. 升级并复用 Pi

- 两个 Pi 依赖同时精确升级到 1.0.0，以发布包为准，先处理直接影响 Noya 的 SDK 兼容变化。
- 复用现有 Pi 交互界面的 /login openai、凭证存储、SettingsManager 安装标识与 OAuth 刷新，不新增 Noya auth 命令、JWT 校验服务、账号档案或跨进程锁。
- 登录使用 Noya 已注入的 ModelRuntime 与 agentDir，避免误用另一个全局 Pi 实例的凭证。四个角色仍共享同一运行时；本期只验收单账号、单进程，角色可以并发。
- 接受 Pi 的客户端名称和重新登录注册行为。账号切换、独立注册名称及更完整的授权生命周期管理后续再做。
- 已核实 Pi 1.0.0 的交互登录会调用共享 ModelRuntime，并通过 SettingsManager 提供持久化 deviceId。实现不需要再造安装身份管理。

### 2. 放开现有模型配置

- 角色 provider 放开 OpenAI，保留现有 model、thinking 和 DeepSeek 配置方式，不增加 authMode 配置层或模型选择界面。本期 OpenAI 路径明确只用于 ChatGPT 订阅，不实现 OpenAI API key 模式。
- 使用 Pi 模型元数据校验配置，修正现有未知模型注册仅写入 DeepSeek 的假设；不搭建账号模型目录、缓存或启动时的在线权限预检服务。
- 首次验收手工选定一个实际可调用的模型供四个角色使用。Pi 模型目录用于配置与能力信息，不能据此宣称账号有访问权限；实际请求被拒绝时明确报错，不静默换模型或降低 thinking。
- 未登录时应能进入现有交互界面完成登录，发出模型请求前必须具备订阅 OAuth 凭证。OpenAI 订阅路径排除环境中的 OPENAI_API_KEY 和旧 Codex 凭证，SDK fallback 不能改变该选择。

### 3. 只补必要的请求适配

- 在共享 ModelRuntime 的模型请求边界补一层小适配，继续委托 Pi 完成消息转换和流解析，不 fork Pi，也不改写写作编排。
- 订阅调用公开 Responses endpoint，使用 store=false、stream=true、本地历史及 instructions／developer 消息。沿用 Pi 已有的字段省略能力，仅补当前发布包仍不符合官方契约的部分。
- 必须补足工具声明格式：普通函数／custom 工具按官方要求放入稳定 namespace，或使用 additional_tools。Noya 内部工具名、权限拦截、工具名单、call ID 与历史重放仍按现有契约工作。
- 完整推理以 response.completed 为准；failed、incomplete 或没有终止事件的断流通过现有助手失败接口报告。未完成流中的工具不得执行，已有产物保留。
- 登录失效和额度不足沿用 Pi 错误信息，必要时补一句重新登录／查看官方用量的指引；不新增错误恢复框架，不自动切换模型、供应方或计费来源。
- 凭证继续存放在现有被工具访问规则禁止的运行目录，由 Pi 管理。不复制到作品、提示词或审计报告；不把 SDK 的 API 价格估算展示成实际订阅扣费。

### 4. 实施顺序与交付条件

| 步骤 | 工作 | 完成条件 |
| --- | --- | --- |
| 1. 升级 | 升级两个 Pi 依赖，修复直接 SDK 兼容问题 | typecheck 与既有测试通过，DeepSeek 路径可用 |
| 2. 配置与登录 | 放开 OpenAI，接好既有 Pi 登录与共享凭证 | 在 Noya 内完成一次登录，重启可复用；OpenAI 路径不会使用付费 API key 补位 |
| 3. 协议适配 | 补工具格式与完整流的必要缺口 | 模拟请求被接受，工具往返及续写历史正确，失败不被登记为成功 |
| 4. 真实写作 | 一个订阅账号、一个模型跑一条短章流程，再重启续写 | Context、Writer、正文检查员与同步核对员实际完成各自工作，并留下脱敏结果 |

不因本迭代调整 SP／Skills、角色职责、章节质量门禁、作者定稿或 Context 同步规则；继续遵守 ADR 0001–0005。

## Testing Decisions

- 主要复用 openWritingSession、共享 ModelRuntime 和现有临时作品 fixture。保留已有“会话工厂”“写作流程”及领域门禁回归，不为每个角色新增测试接口。
- OAuth 模拟只覆盖 Noya 新增的运行时接线与凭证选择，不重写 Pi 通用 OAuth／JWKS 测试矩阵；浏览器授权和刷新复用通过真实验收确认。Responses 在外部请求／流边界模拟，真实工具、任务登记和产物保存照常运行。
- 新测试集中在三个行为：工具声明与调用／历史重放能工作；未登录时即使有 API key 也不绕过订阅选择；额度错误、incomplete 与断流能被现有流程识别为失败。
- 断言外部请求、工具效果、轮次结果和保存产物，不断言内部类结构或复制实现步骤。
- 真实验收：作者在浏览器授权 Pi，选定一个可用模型，先完成一条极小请求，再走“准备 Writing Package → Writer 章节方案与短初稿 → 正文检查 → 作者定稿 → 同步核对与 Context 同步”，退出后继续该写作任务并完成下一条请求。
- 凭证、完整回调 URL 和含 token 的授权 URL 不进入验收记录。记录依赖版本、模型、完成事件、工具与产物结果，以及是否成功续写即可。
- 模拟通过与真实订阅验收分别报告；未完成真实调用时不能称接入已验证。文学质量留给另外的写作评估。

## Out of Scope

- Noya 独立 OAuth 客户端、OIDC 身份体系、注册复用与远端撤销管理。
- 多账号／多工作空间切换、跨设备同步和跨进程刷新协调。
- 新 auth CLI、账号模型目录服务、用量仪表盘、定制登录 UI。
- OpenAI API key 模式、自动 fallback、商业准入与远程托管。
- 修改小说写法、业务门禁、作品 schema 或另建恢复协议。

## Further Notes

本计划按作者“作为 v0 迭代有点太复杂”的反馈替换上一版范围。已确认的应用层测试边界继续沿用，授权和安装身份管理尽量委托 Pi。

当前仍只是计划；尚未升级依赖或完成真实订阅调用。若升级后的实际请求显示 Pi 已补齐某个协议缺口，就删除对应适配，只保留可观察行为验收。

来源：

- [Pi 1.0.0 更新记录](https://github.com/earendil-works/pi/blob/a13d35a742c6ef8462812a28fbe1d8c8b7431c32/packages/ai/CHANGELOG.md)
- [Pi 1.0.0 交互登录与共享 ModelRuntime](https://github.com/earendil-works/pi/blob/a13d35a742c6ef8462812a28fbe1d8c8b7431c32/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L6245)
- [Pi 1.0.0 安装标识持久化](https://github.com/earendil-works/pi/blob/a13d35a742c6ef8462812a28fbe1d8c8b7431c32/packages/coding-agent/src/core/settings-manager.ts#L1175)
- [OpenAI 本地个人项目接入范围](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt)
- [Responses 订阅协议限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- [模型调用与完成判定](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
