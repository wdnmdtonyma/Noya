# 09 — Context 同步 + 同步核对员

**What to build:** 章节定稿后，Context Agent 读定稿正文，提出资料变化清单（人物志、世界志、大纲、资料库的变化，以及该章的摘要与重要登场角色），每条附定稿正文中的原文摘录，用 `save_sync_proposal` 保存。随后派出同步核对员，它逐条判定"有依据 / 无依据 / 冲突"并用 `save_sync_check` 提交。Context Agent 用 `apply_sync` 写入选中的变化：有依据的直接写入，其余必须附作者确认。写入后若该章摘要已填写，待同步标记清除，作者就可以开始下一章。Context Agent 无法给同步核对员发消息。

契约详见 `.scratch/noya-v0/spec.md`："同步"全节、"作者消息与作者确认"、"Subagent"中 sync_checker 的输入、工具与文件范围、"原子性与 git"、附录中的 `save_sync_proposal`、`save_sync_check`、`apply_sync`。

**Blocked by:** 03, 08

**Status:** ready-for-agent

- [ ] `save_sync_proposal({ chapter_id, changes })`：章节必须在待同步列表中；每条变更 `id` 符合 ID 格式且清单内唯一；`change` 为 `write_canon` 的任一变更类型或 `chapter_meta`（`chapter_meta.chapter_id` 必须等于清单的 `chapter_id`）；`evidence` 至少一条，每条至少 4 个非空白字符并逐字出现在该章正式正文中；整份清单在内存中试应用并通过全部 schema 与一致性校验才保存为 `proposal_N`
- [ ] `spawn_subagent({ role: "sync_checker", proposal_id })`：新会话（`sync_checker-N`），核对员的模型与占位 SP；输入目录含变更清单与该章定稿正文；工具为 `save_sync_check`、`query_canon`、`read`、`grep`；文件范围为输入目录只读
- [ ] `save_sync_check({ verdicts })`：清单中每条变更恰好一条结论；`verdict` ∈ `supported`/`unsupported`/`conflict`；`reason` 非空；`conflicting_ids` 在 `conflict` 时非空且 ID 存在，其他情况为空；保存为 `check_N`；同一清单可有多份，以最新一份为准
- [ ] `apply_sync({ proposal_id, change_ids, author_confirmation? })`：该清单必须已有核对结果；所选变更有非 `supported` 时必须提供满足作者确认规则的片段，否则整批拒绝；整批校验、原子写入、一次提交；应用后该章 `summary` 非空则在同一次提交中移出待同步列表；成功的 `apply_sync` 计为"上次写入"，影响后续作者确认判断
- [ ] 同步失败不改动正式正文
- [ ] `send_message` 发给同步核对员被拒
- [ ] 测试：证据摘录不在定稿正文中 → 拒；章节不在待同步列表 → 拒；`chapter_meta` 针对其他章节 → 拒；无核对结果时 `apply_sync` → 拒；核对结论缺少某条变更 → 拒；包含 `conflict` 变更且无确认 → 拒；两份核对结果时以最新一份为准；全部 `supported` 且含摘要 → 写入、待同步清除、之后 `save_package` 与 `spawn_subagent(writer)` 恢复可用
