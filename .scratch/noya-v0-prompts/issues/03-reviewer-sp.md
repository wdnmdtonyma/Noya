# P3 — 正文检查员 SP

**What to build:** 正文检查员拿到 Brief、Pack 与一版初稿后，按四项质量门禁逐项给出结论；明确冲突附上从 Brief 或 Pack 逐字复制的依据与从初稿逐字复制的位置；资料未记录的事标为待核实而不是冲突；人物动机结合处境判断；编辑建议定位到段落并给出修改方向；不替 Writer 写替换正文；提交被拒时按原因修正后重新提交。

契约详见 `.scratch/noya-v0-prompts/spec.md`："正文检查员 SP"；检查结果的格式与校验见 `.scratch/noya-v0/spec.md`"任务产物"中的检查结果规则与 `docs/design/chapter-review.md`。

执行者：架构负责人。

**Blocked by:** 实现 07（仅限真实运行验证）

**Status:** ready-for-agent

- [ ] 检查员 SP 不超过约 1500 汉字，含一个取自 `chapter-review.md` 示例一的 violation 示例
- [ ] 准备一份"埋雷"测试初稿：至少埋入 1 处违反 Brief 要求、1 处道具能力误用（Pack 中有依据）、1 处 Pack 未提及但不矛盾的能力使用（应为待核实而非冲突），另有 1 处无问题的反常行为（有处境支撑）
- [ ] 每份埋雷稿检查三次：两处真冲突的检出率、待核实项被误判为 violation 的次数、有支撑的反常行为被误判的次数，记录在迭代日志
- [ ] 目标：两处真冲突每次都检出；误判为 violation 的次数为 0
- [ ] 统计 `save_review` 被拒次数及原因；平均每次检查被拒不超过 1 次
