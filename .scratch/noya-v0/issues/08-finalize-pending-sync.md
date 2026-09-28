# 08 — `/finalize` + 待同步拦截

**What to build:** 作者读完交稿后输入 `/finalize`（可指定初稿版本，默认本任务最新初稿），该初稿立即成为正式章节：写入正式区、加入待同步列表、提交 git。随后 Context Agent 收到"某章已定稿，请进行 Context 同步"的程序消息并开始一轮，这条消息不算作者消息。存在待同步章节时，`save_package` 与 `spawn_subagent(writer)` 都被拒绝，原因列出待同步章节。模型没有任何能写章节正文的工具。作者可以重新定稿已定稿的章节，该章重新进入待同步并保留原顺序；此后 `rewrite_chapter` 类型的 Brief 可以指向它。

契约详见 `.scratch/noya-v0/spec.md`："作者命令"中的 `/finalize`、"任务产物"中的 Brief 规则、"Context Agent 的工具与权限"中的 `save_package`、"Subagent"中 Writer 的派发规则、"原子性与 git"、"校验与错误约定"中的写锁。章节 schema 采用 `docs/design/context-types.md` 中的 Chapter。

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] `/finalize [draft_id]`：章节 ID 取自该初稿所属 Brief；标题取第一个非空行 `# ` 之后内容；正文取其后部分；新章 `order` = 现有最大值 + 1；重新定稿保留原 `order`；写入 `status: finalized`、`summary: ""`、`key_characters: []`，通过 Chapter schema 校验
- [ ] 章节文件与同步状态（加入章节 ID）原子写入并一次提交，提交信息标明章节 ID 与"任务 ID / 初稿 ID"；持有进程级写锁，模型运行中执行也不与其他写入交错
- [ ] 定稿后以自定义消息通知 Context 会话并触发一轮；该消息不是作者消息
- [ ] 无初稿或初稿不存在时给出明确错误，不改动任何文件
- [ ] `save_package` 与 `spawn_subagent({ role: "writer" })` 在待同步列表非空时拒绝，原因列出待同步章节
- [ ] `rewrite_chapter` 的 Brief：`chapter_id` 为已定稿章节时通过
- [ ] 任何角色的工具列表中不存在写章节的工具
- [ ] 测试：`/finalize` 后正式区出现合法 Chapter、同步状态含该章、只有一次提交；定稿通知中的文字不能作为 `write_canon` 的作者确认；随后 `save_package` 被拒；用定稿前保存的 Package `spawn_subagent(writer)` 被拒；重新定稿同一章保留 `order` 并再次进入待同步；`rewrite_chapter` 指向已定稿章节通过、指向不存在章节被拒
