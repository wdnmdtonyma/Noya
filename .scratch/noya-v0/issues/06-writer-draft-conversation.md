# 06 — Writer 写正文、多轮对话、停止

**What to build:** Context Agent 审过方案后用 `send_message` 告诉 Writer "方案通过，写正文"，Writer 写出初稿并用 `submit_draft` 提交。每条发给 Writer 的消息末尾都由程序自动附上它当前绑定 Package 的 Brief 全文。Writer 运行中时，消息在其下一次模型调用前送达。作者推翻方向时，Context Agent 派出新 Writer，旧 Writer 自动退役，之后发给旧 Writer 的消息被拒。作者可以用 `/stop` 停止所有运行中的 Subagent，Context Agent 也能用 `stop_subagent` 停止单个；已停止的 Writer 收到新消息会继续工作。Context Agent 做纯措辞修正时，可以编辑 Writer 的初稿工作文件，再用 `save_revision` 另存为新初稿版本。

契约详见 `.scratch/noya-v0/spec.md`："任务产物"（初稿格式与初稿归属）、"Subagent"（`send_message`、`stop_subagent`、Writer 工具）、"Context Agent 的工具与权限"（`save_revision` 与 `edit` 范围）、"作者命令"中的 `/stop`、附录。

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] `submit_draft({})`：把工作文件中的初稿快照为不可变版本 `draft_N`（第一个非空行为 `# 标题`、正文非空）；记录 Writer 与其当前绑定的 Package；该 Writer 从未提交方案时拒绝
- [ ] `send_message({ agent_id, message, package_id? })`：只接受 Writer（检查员与核对员的拒绝在 07、09 测试，本 ticket 对非 Writer 一律拒绝）；运行中 → steer；空闲或已停止 → 开始新一轮；已退役、已终止、失败 → 拒绝；`package_id` 改绑要求新 Package 的 `chapter_id` 与原绑定相同；程序在消息末尾附上当前绑定 Package 的 Brief 全文
- [ ] 新的 `spawn_subagent(writer)` 使本任务已有的活跃 Writer 停止并标记为已退役；同一时刻只有一个活跃 Writer
- [ ] `stop_subagent({ agent_id })`：中止当前轮，保留会话，状态为已停止，并推送停止通知
- [ ] `/stop` 作者命令：停止本任务所有运行中的 Subagent
- [ ] `save_revision({})`：把当前活跃 Writer 的初稿工作文件快照为新初稿版本，继承其 Package 绑定；该 Writer 运行中时拒绝
- [ ] Context 的 `edit` 只允许作用于当前活跃 Writer 的方案或初稿工作文件，且该 Writer 不在运行中
- [ ] 测试：未交方案先交初稿被拒；首行不是标题的初稿被拒；运行中 `send_message` 的内容出现在 Writer 下一次模型请求中；Writer 收到的消息末尾附有 Brief；改绑到不同 `chapter_id` 的 Package 被拒；新 Writer 生效后给旧 Writer 发消息被拒；`/stop` 后运行中 Writer 状态为已停止；已停止的 Writer 收到消息后开始新一轮；Writer 运行中 Context `edit` 其工作文件被拒；Context 修改工作文件后 `save_revision` 生成新版本且归属不变
