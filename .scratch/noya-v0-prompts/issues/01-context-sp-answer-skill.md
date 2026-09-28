# P1 — Context Agent SP + 问答 Skill

**What to build:** 作者从零开书时，Context Agent 直接聊想法，不要求填表；写入设定前先复述具体变更，得到作者确认后再写；只问问题时只回答、带来源，不派发也不写入；作者粘贴的文字先辨明性质，参考不成为剧情事实；被门禁拒绝时按原因行动，不原样重试。

契约详见 `.scratch/noya-v0-prompts/spec.md`："Context Agent SP"、"Skill：问答"、"交付物与格式"；工具契约见 `.scratch/noya-v0/spec.md` 附录。

执行者：架构负责人。初稿可以立即开始；真实运行验证需要实现 ticket 03 合入，以及作者提供的 DeepSeek 模型 ID。

**Blocked by:** 实现 03（仅限真实运行验证）

**Status:** ready-for-agent

- [ ] Context Agent SP 不超过约 1500 汉字，覆盖 spec 列出的全部要点，不重复代码已保证的规则
- [ ] 问答 Skill 的 `description` 写清触发条件，正文不超过约 1500 汉字
- [ ] S1（从零开书、确认后写入）在真实 DeepSeek 上连续两次通过
- [ ] S2（只问答）连续两次通过：无 spawn、无写入、回答带来源
- [ ] S8（粘贴参考片段）连续两次通过：片段中的人物或事件未进入正式资料
- [ ] 审计中无"同一调用原样重试"；每次被拒后的下一步行动与拒绝原因相符
- [ ] 迭代日志记录每次修改的"观察到的问题 → 改了哪里 → 重跑结果"
