# 07 — 正文检查员

**What to build:** Writer 交出初稿后，Context Agent 用 `spawn_subagent({ role: "reviewer", draft_id })` 派出正文检查员。每次都是全新会话，只看到该初稿所属 Package 的 Brief、Pack 和该初稿。检查员按四项质量门禁检查，用 `save_review` 提交 ChapterReview；结构不合法、四项结论与反馈不一致、明确冲突没有依据、引用的正文摘录不在被检查的初稿中、依据摘录不在 Brief 或对应 Pack 段落中，都会被拒绝，检查员可修正后重新提交。Context Agent 无法给检查员发消息。收到通知后，Context Agent 可以把问题发给原 Writer 返修，再对新初稿派一个新检查员——完整的"检查 → 返修 → 再检查"可以演示。

契约详见 `.scratch/noya-v0/spec.md`："任务产物"中的检查结果规则、"校验与错误约定"中的逐字匹配规则、"Subagent"中 reviewer 的输入、工具与文件范围、附录中的 `save_review`。schema 与一致性规则来自 `docs/design/chapter-review.md`（schema 全文与"Schema 之外的一致性校验"第 1、2、4 条）。

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] `spawn_subagent({ role: "reviewer", draft_id })`：初稿必须存在；按初稿归属反查 Package；每次新建会话（`reviewer-N`），使用检查员的模型与占位 SP
- [ ] 检查员输入目录含 Brief、Pack、该初稿；首条消息为这三者；工具为 `save_review`、`read`、`grep`；文件范围为输入目录只读
- [ ] `save_review({ review })`：ChapterReview schema；`chapter_id` 等于 Brief 的 `chapter_id`；第 1、2、4 条一致性规则；`location.excerpt`（非 null）逐字出现在被检查初稿中；`evidence`：`source_id` 为 Brief `id` 时 `excerpt` 逐字出现在 Brief 某个字符串值中，否则 `source_id` 必须出现在某个 Pack 段落的来源行，且 `excerpt` 逐字出现在来源行包含该 ID 的某个段落正文中；摘录至少 4 个非空白字符
- [ ] 通过后保存为 `review_N`，关联被检查的初稿版本；通知只带 `review_id`
- [ ] `send_message` 发给检查员被拒
- [ ] 测试：两次派检查员得到两个不同会话，第二个会话的模型请求中不含第一个的任何内容；摘录不在初稿中 → 拒；有 `violation` 但该项为 `passed` → 拒；`failed` 项无对应反馈 → 拒；`violation` 无证据 → 拒；证据摘录只存在于正式区原文、不在 Pack 中 → 拒；3 个字的摘录 → 拒；合法结果被保存并通知 Context；检查员写文件被拒；`send_message` 给检查员被拒
