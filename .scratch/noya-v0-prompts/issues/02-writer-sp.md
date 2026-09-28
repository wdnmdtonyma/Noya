# P2 — Writer SP

**What to build:** Writer 拿到 Writing Package 后，先交一份简短的章节方案（章级概述 + 章内事件时间线，说明衔接、动机与变化），收到"方案通过"后再写正文；严格遵守 Brief 的要求、边界、`leave_open` 与 `creative_scope`，只用 Pack 中的事实；返修时只改被指出的段落，以消息末尾附带的最新 Brief 为准；正文用具体动作、对白与器物承载处境，不以旁白宣布结果。

契约详见 `.scratch/noya-v0-prompts/spec.md`："Writer SP"；工具与文件格式见 `.scratch/noya-v0/spec.md`（初稿首行 `# 标题`、`submit_plan` / `submit_draft`）。

执行者：架构负责人。

**Blocked by:** 实现 06（仅限真实运行验证）

**Status:** ready-for-agent

- [ ] Writer SP 不超过约 1500 汉字；不含具体文风规则
- [ ] 用一份固定的测试 Package（由 P1 阶段的书生成）运行两次：两次都先提交方案、未收到"方案通过"前没有提交初稿
- [ ] 方案逐条覆盖 Brief 的 `requirements`，没有越过 `constraints` 与 `leave_open`（人工核对并记录）
- [ ] 初稿格式通过 `submit_draft` 校验，没有因格式被拒超过一次
- [ ] 发送一条附具体位置与修正目标的返修消息：Writer 用 `edit` 修改而非整章重写，修改范围与反馈对应（对比两版差异记录）
- [ ] 迭代日志记录修改与结果
