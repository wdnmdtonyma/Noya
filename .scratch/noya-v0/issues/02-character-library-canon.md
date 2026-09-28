# 02 — 人物志 / 资料库的查询与写入 + 作者确认 + 路径守卫

**What to build:** 作者与 Context Agent 聊出一个人物和他的功法，作者说"可以"后，Context Agent 用 `write_canon` 一次写入人物志与资料库条目，git 中出现一次提交。写入必须附作者确认：片段逐字出自作者最近一条消息，且那条消息晚于上次写入；通知等程序注入的消息不算。格式错误、ID 格式非法、引用不存在的对象、ID 重复都会被整批拒绝并返回所有错误。Context Agent 能用 `query_canon` 搜索和读取正式资料。路径守卫生效：Context Agent 不能用内置工具修改正式区，也读不到运行时目录和其他作品。

契约详见 `.scratch/noya-v0/spec.md`："ID 与版本"、"校验与错误约定"、"正式资料 schema 与一致性"、"作者消息与作者确认"、"Context Agent 的工具与权限"、"Subagent"中的路径守卫规则、"原子性与 git"、附录中的 `query_canon` 与 `write_canon`。schema 直接采用 `docs/design/context-types.md` 中的 CharacterProfile 与 LibraryEntry。

本 ticket 只实现人物志与资料库两类变更；世界志、大纲变更在 03。`state.location_id`、`source_chapter_ids` 的引用校验在本 ticket 就按"对象必须存在"实现——世界志与章节尚无数据时，非空引用即被拒绝。路径守卫做成按角色配置允许范围的通用实现，后续 ticket 为 Subagent 角色复用。

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `query_canon`：`search`、`get`、`list`（本 ticket 覆盖人物与资料库，结构上可扩展到其他类型）
- [ ] `write_canon`：人物志 upsert/delete、资料库 upsert/delete；在 `prepareArguments` 中用 ajv（2020-12，strict、allowUnionTypes、不转换、不补默认值）校验原始参数
- [ ] ID 格式 `^[a-z0-9][a-z0-9_-]{0,63}$` 在写文件前检查；全作品 ID 全局唯一
- [ ] 一致性校验在应用整批后的状态上进行：引用存在（能力、持有物、关系、位置、认知来源章节）；同一人物 `state.attributes[].key`、`resources[].key`、`abilities[].entry_id` 不重复；资料库 `attributes[].key` 不重复；同一持有物 ID 不在两个人物中；删除被引用对象被拒并列出引用方
- [ ] 作者确认：去首尾空白后非空且不全是标点；逐字出现在最近一条 user 角色消息中（只统一 CRLF）；该消息晚于本会话最近一次成功的 `write_canon`；全部从会话记录推导
- [ ] 任一项失败整批不落盘，返回以 `[拒绝]` 开头的全部错误
- [ ] 成功时临时文件 + rename，只 `git add` 本次写入或删除的文件，提交一次，提交信息标明操作与对象 ID；正式区有其他未提交修改时在结果中列出
- [ ] 写正式区的工具以顺序模式执行并持有进程级写锁
- [ ] 路径守卫：按 spec 的解析方式（`@`、`~`、`file://`、Unicode 空白、相对工作目录、真实路径、不存在时取最近已存在祖先）还原目标；Context 的 `edit` 在正式区被拒；任何工具访问运行时目录或其他作品被拒；以禁区祖先目录为搜索根被拒；Context 可读 Skills 目录
- [ ] 测试（faux 会话）：确认片段不在最近一条作者消息中 → 拒；作者消息早于上次成功写入 → 拒；用程序注入消息中的文字作确认 → 拒；只有标点的确认 → 拒；schema 错误 → 拒；ID 含 `../` → 拒且无文件产生；悬空引用 → 拒；同批新建人物与其功法 → 通过且只有一次提交、只含这两个文件；任一项错误 → 无文件变化、无提交
- [ ] 测试：`edit` 正式区文件被拒；`read` 运行时目录被拒；`grep` 以作品根目录的上级为搜索根被拒；`read` Skill 文件通过
