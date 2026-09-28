# 迭代日志

规则：每次只改一个文件（一份 SP 或一个 Skill）；每条记录"观察到的问题 → 改了哪里 → 重跑结果"；同一场景至少跑两次再下结论；根因在工具契约或门禁的，记入下方"反馈给实现 spec"，不在提示词里打补丁。

提示词文件：`v0/prompts/sp/{context,writer,reviewer,sync_checker}.md`，`v0/prompts/skills/{write-chapter,context-sync,answer}/SKILL.md`。

## 版本

| 日期 | 版本 | 说明 |
|---|---|---|
| 2026-09-28 | v1 | 初稿：四份 SP 与三个 Skill，汉字数 context 986 / writer 845 / reviewer 843 / sync_checker 564 / write-chapter 912 / context-sync 563 / answer 394 |

## 运行记录

| 日期 | 场景 | 模型 / 档位 | 结果 | 观察到的问题 | 改了哪里 | 重跑结果 |
|---|---|---|---|---|---|---|
| | | | | | | |

尚无真实运行：实现 ticket 01–11 尚未完成，DeepSeek 模型 ID 待作者提供。

## 反馈给实现 spec（撰写提示词时发现的契约缺口）

1. **Context Agent 如何按 ID 读取产物未定义。** 通知只带 `plan_1`、`review_1` 等 ID；`get_subagents` 也只返回 ID。spec 规定产物在"任务区 `artifacts`"，但没有规定文件名，也没有告诉 Context Agent 当前任务目录在哪里，而作品目录下会有多个任务的同名 `review_1`。建议二选一：通知与 `get_subagents` 返回产物的相对路径；或提供只读工具 `get_artifact({ id })`。当前 SP 只写了"产物在当前任务目录的 `artifacts` 中"。
2. **纯措辞修正时 Context Agent 不知道写手初稿工作文件的路径。** `edit` 只允许作用于活跃 Writer 的方案或初稿工作文件，但路径只写进了 Writer 的首条消息。建议 `get_subagents({ agent_id })` 返回该 Writer 的方案与初稿工作文件路径。
3. **交稿时告诉作者"初稿位置"缺少面向作者的路径。** 同第 1 条；若产物路径可得，Context Agent 可直接告知。
4. **写手不提交就结束时，Context 只能看到最后回复的前 200 字。** Writer SP 要求"意见与要求矛盾时不提交，用一两句话说明"，依赖这 200 字足够；暂不改，观察审计中的"未提交产物"轮次。
5. **SP / Skill 路径与实现侧占位不一致（2026-09-28 发现，已在本地处理）。** 已把 `v0/noya.config.json` 改指 `prompts/sp/`，删除占位 SP 与占位 Skill `ask-work`、`sync-canon`；配置文件属于实现 ticket 01，随其提交。原记录： 实现侧 `v0/noya.config.json` 指向占位文件 `prompts/{context,writer,reviewer,sync-checker}.md` 与 `prompts/skills/`（含占位 Skill `ask-work`、`sync-canon`、`write-chapter`）。正式 SP 在 `prompts/sp/`，正式 Skill 为 `answer`、`context-sync`、`write-chapter`。需统一：配置改指 `prompts/sp/`，删除占位 SP 与重复的占位 Skill；否则 Context 会同时看到两套 Skill。
