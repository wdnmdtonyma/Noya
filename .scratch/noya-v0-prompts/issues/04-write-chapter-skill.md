# P4 — 写一章 Skill

**What to build:** 作者说"写下一章"后，Context Agent 按 Skill 走完：确认要求 → 查资料组织 Pack → 保存 Package → 派 Writer → 检查方案 → 写正文 → 派检查员 → 补查待核实项 → 按依据返修 → 新检查员复查 → 满足停止条件后交稿。生成中作者插话时，按"追加调整 / 推翻方向"选择改绑原 Writer 或开新 Writer；纯措辞修正由 Context Agent 直接完成并复查。

契约详见 `.scratch/noya-v0-prompts/spec.md`："Skill：写一章"、评估场景 S3、S4、S5、S9。

执行者：架构负责人。

**Blocked by:** P1, P2, P3

**Status:** ready-for-agent

- [ ] 写一章 Skill 的 `description` 写清触发条件，正文不超过约 1500 汉字
- [ ] S3（完整写一章）连续两次通过：审计显示有方案检查、每份交稿前的初稿都有检查结果、按停止条件交稿
- [ ] S4（生成中追加要求）连续两次通过：改绑原 Writer，没有开新 Writer
- [ ] S5（推翻关键事件结果）连续两次通过：新 Package、新 Writer、旧 Writer 退役
- [ ] S9（改一个词）连续两次通过：`edit` + `save_revision` + 新检查员复查，没有开新 Writer
- [ ] 审计中 Context Agent 没有轮询 `get_subagents`（每轮调用不超过 1 次）；交稿消息中没有贴整章正文
- [ ] 迭代日志记录修改与结果
