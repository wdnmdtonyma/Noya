# 02 — 用 ChatGPT 订阅完成 Context 交互与工具调用

**What to build:** 作者在现有角色配置中选择 OpenAI，在 Noya 的 Pi 交互界面使用 /login openai 完成订阅登录；Context Agent 能接收作者请求、实际调用 Noya 工具并返回结果。未登录或调用失败时明确报告，不自动使用付费 API key。

**Blocked by:** 01 — 升级 Pi，保持 DeepSeek 写作与续写可用。

**Status:** ready-for-agent

- [x] 角色 provider 接受 OpenAI，保留现有 model、thinking 与 DeepSeek 配置；未知模型元数据按 provider 注册，不误写入 DeepSeek。
- [x] 缺少授权时仍可进入现有 Pi 交互界面完成登录；登录使用 Noya 注入的共享 ModelRuntime 和凭证目录，安装标识、凭证保存与刷新委托 Pi。接受授权界面显示 Pi，不新增独立账号体系。
- [x] OpenAI 路径仅使用该运行时的订阅 OAuth 凭证；即使环境中存在 OPENAI_API_KEY 或旧 Codex 凭证，未登录也不能发起付费或旧路径请求，不能自动更换供应方、模型或 thinking。
- [x] 请求使用公开 Responses endpoint、store=false、stream=true、本地历史和 instructions／developer 消息；在共享请求边界仅补发布包实际缺少的订阅协议适配。
- [x] Context Agent 的真实 Noya 工具能通过 namespace 或 additional_tools 完成声明、调用及结果返回；内部工具名、权限拦截、call ID 与本地历史重放保持正确。
- [x] response.completed 才代表完成；额度错误、failed、incomplete 和无终止事件的断流能通过现有助手失败接口报告；不执行半截工具调用，已完成产物保留。
- [x] 通过现有应用层 fixture 和共享 ModelRuntime，在外部 OAuth／Responses 边界验证接线、凭证选择、工具往返与上述失败行为；不重建 Pi 通用 OAuth／JWKS 测试，不让凭证进入模型输入、作品、日志或 Git 历史。typecheck 与既有回归通过。

## Comments

2026-10-03：实现与相关验证完成。两个 Pi 包均为 1.0.0；typecheck 与全量 57 个测试通过。真实 Noya 的 Pi 界面已由作者授权，Context 极小请求、工具调用、Package 保存和 Writer 派发成功。四角色真实整链路及重启结果统一见 [验收记录](../validation.md)。
