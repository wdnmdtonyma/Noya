# Implementation review

Fixed point: `e0c10c17d4329727132db4545e25ec7072b042f6`.

两个独立子代理按 `code-review` 分别检查 Standards 与 Spec。初始实现提交为 `eb00776`；修复另行提交。

## Standards

没有需要修改的发现。实现沿用 CONTEXT 术语及 ADR 0005 的 Pi SDK 边界；OAuth 保存、刷新、请求转换及解析仍委托 Pi。订阅选择和协议缺口集中在一个适配模块。

## Spec

初审发现 1 个 P2：审计报告已排除 API 价格估算，但 Pi 的交互 footer 和 `/session` 仍显示美元金额，未明确说明它不是订阅扣费。

已修复：Context 的 `session_start` 和 `model_select` 通过 Pi 的 `setStatus` 添加持续可见说明“API 估算金额，非 ChatGPT 订阅扣费”。当前模型为 OpenAI，或当前任务的保存历史含 OpenAI 响应时保留该说明；切换到 DeepSeek 后也不会让混合历史的累计估算失去说明。短文案在窄终端中仍能保留关键信息，没有新增用量页面或 fork Pi。真实 Pi CLI 重启后已确认说明显示；`/session` 保留同一 footer。

没有发现其他具体实现偏差或范围扩张。订阅相关测试通过；真实验收结果见 [validation.md](validation.md)。

合计：Standards 0；Spec 1，已修复并复核。
