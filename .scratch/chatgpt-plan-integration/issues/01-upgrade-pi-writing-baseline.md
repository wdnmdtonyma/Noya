# 01 — 升级 Pi，保持 DeepSeek 写作与续写可用

**What to build:** 作者使用原有 DeepSeek 配置启动 Noya，在 Pi 1.0.0 上继续讨论、派发 Writing Agent、检查正文，并在退出后继续已有写作任务。为订阅接入准备兼容基线，只修复本次 SDK 升级直接引起的变化。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] 两个 Pi 依赖同时精确锁定为 1.0.0，锁文件一致；依据发布包处理兼容问题，不依赖未发布接口。
- [x] 原有 DeepSeek 配置无需新增字段即可启动；各角色的模型与 thinking 仍按配置选择。
- [x] 既有写作流程 fixture 能覆盖 Context、Writer、正文检查员与同步核对员；工具名单、提示词来源、Writing Package 输入隔离和领域门禁保持既有契约。
- [x] 退出后继续已有写作任务，原对话、任务登记与已完成产物可用；SDK 升级不触发模型静默替换。
- [x] typecheck 与既有测试通过，并记录验证结果；不借升级修改 SP／Skills、作品 schema 或恢复策略。

## Comments

2026-10-03：实现与相关验证完成。两个 Pi 包均为 1.0.0；typecheck 与全量 57 个测试通过。真实 Noya 的 Pi 界面已由作者授权，Context 极小请求、工具调用、Package 保存和 Writer 派发成功。四角色真实整链路及重启结果统一见 [验收记录](../validation.md)。
