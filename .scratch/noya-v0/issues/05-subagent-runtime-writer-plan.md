# 05 — Subagent 运行时 + Writer 交方案

**What to build:** Context Agent 用 `spawn_subagent({ role: "writer", package_id })` 派出 Writer，工具立即返回 `agent_id`，作者可以继续和 Context Agent 说话。Writer 在独立会话中只看到程序装配的 Brief 与 Pack，写出章节方案并用 `submit_plan` 提交。Writer 这一轮结束时，Context Agent 自动收到一条只含产物 ID 的通知并开始新一轮；Context Agent 每次请求模型前都能看到一行当前 Subagent 状态摘要，也能用 `get_subagents` 查询。Writer 的文件工具只能访问自己的工作目录。

契约详见 `.scratch/noya-v0/spec.md`："Subagent"（spawn、get、角色工具与文件范围、路径守卫、子会话运行、通知与状态）、"会话工厂"（按角色注入模型）、附录中的 `spawn_subagent`、`get_subagents`、`submit_plan`。

本 ticket 只支持 `writer` 角色；`reviewer` 与 `sync_checker` 在 07、09 中基于同一运行时添加。

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] `spawn_subagent({ role: "writer", package_id })`：只接受已存在的 `package_id`；立即返回 `agent_id`（`writer-N`，按任务编号）
- [ ] Writer 子会话由会话工厂创建：Writer 占位 SP 与 Writer 的模型；工具为 `submit_plan`、`read`、`grep`、`write`、`edit`（`submit_draft` 在 06 加入）；工作目录为该 Writer 的工作目录；Brief 与 Pack 写入其输入子目录；首条消息为程序装配的 Brief、Pack，并说明方案文件与初稿文件的固定文件名；会话 JSONL 位于运行时目录并登记
- [ ] 子会话完成扩展绑定；后台 prompt 的错误被捕获并记为失败；不绑定 Context 工具调用的中止信号
- [ ] `submit_plan({})`：把工作目录中的方案文件快照为不可变版本 `plan_N`（非空），返回 `plan_id`
- [ ] 以子会话的"就绪（settled）"事件作为一轮结束：向 Context 会话发送自定义消息（followUp 送达并触发一轮）：`[writer-1 完成] 本轮提交：plan_1`（列出本轮全部产物）；未提交则 `[writer-1 结束，未提交产物] <最后回复前 200 字>`；失败附原因；不含产物全文；不属于作者消息
- [ ] 状态摘要：通过 Pi 的 `context` 事件在每次 Context 模型请求前临时附加一行，不写入会话记录；由通知触发的轮次同样生效
- [ ] `get_subagents({ agent_id? })`：无参返回简要状态列表；有参返回角色、状态、输入引用、最近产物 ID、失败原因
- [ ] Subagent 登记（ID、角色、会话文件、输入引用、状态、产物、每轮开始与结束时间）写入任务登记，放在模块级别，扩展重新实例化后仍可用；`--continue` 时把仍为运行中或空闲的 Subagent 标记为已终止
- [ ] Writer 路径守卫：内置工具目标不在该 Writer 工作目录内即拒绝
- [ ] 测试：`spawn_subagent` 在 Writer 完成前返回；Writer 首条消息只含 Brief、Pack 与文件名说明；Writer 提交方案后 Context 会话收到只含 `plan_1` 的通知，且通知触发了 Context 新一轮；通知轮次中模型请求包含状态摘要，会话记录中不包含；Writer 读取 Context 会话文件或正式区被拒；Writer 脚本抛错时 Context 收到失败通知且进程不崩溃
