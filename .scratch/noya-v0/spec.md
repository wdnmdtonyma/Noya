# Noya v0：基于 Pi coding-agent 的写作流程试验版

Status: ready-for-agent

日期：2026-09-28（同日经两轮对抗评审修订）。依据：CONTEXT.md、ADR 0001–0005、`docs/design/mvp-flow-and-architecture.md`（下称"架构稿"）、`context-types.md`、`writing-brief.md`、`chapter-review.md`。本 spec 与上述文档不一致处以本 spec 为准，差异列在"Further Notes"。所用 Pi 版本为 `@earendil-works/pi-coding-agent@0.87.1`，以发布包为准，不使用只存在于 Pi 源码仓库的接口。

## Problem Statement

作者（本项目负责人）已经把 Noya 的写作流程设计到了文档层面：Context Agent 与作者讨论，整理 Writing Package，派发独立的 Writing Agent 写章节方案和正文，由每次新开会话的正文检查员对抗检查，作者定稿后再做 Context 同步。但这些都只是纸面设计，作者无法回答两个关键问题：

- **A. 质量链路是否有效**：独立 Writer + 正文检查员对抗检查 + 按依据返修，写出的章节是否真的比 Writer 直接交稿更好、更少事实错误？代价（时间、token）是否值得？
- **B. 软流程是否可靠**：只靠系统提示词（SP）和 Skills 指引，Context Agent 能否稳定走完"从零讨论 → 写入设定 → 准备材料 → 派发 → 检查 → 交稿 → 定稿 → 同步"的全过程？它会在哪里跳步、记错或越权？硬门禁是否真能拦住越权？

不先得到这两个答案，后续的产品化（前端、恢复协议、索引等）都可能建在错误的流程上。

## Solution

做一个可以真实使用的 v0：作者在终端里启动 `noya`，不需要填表或导入任何资料，直接开始聊一本新小说。Noya 基于 Pi coding-agent 的交互界面运行，Context Agent 使用 Noya 自己的 SP 与 Skills，Writer、正文检查员、同步核对员作为独立会话的 Subagent 运行，所有"绝不能发生"的规则由 Noya 扩展中的工具代码强制。

作者用它从零开一本书、写若干章。每章都能用盲评方式比较"Writer 直接交出的第一版初稿"与"经检查返修后的交稿版本"（对照比较）。每个写作任务结束后，评估者可以对会话记录运行审计，得到跳步、被门禁拒绝的调用、返修轮数、token 与耗时等数据，据此调整 SP、Skill 或门禁。

分工：SP（四个角色）与 Skills（三个）由架构负责人按 `.scratch/noya-v0-prompts/spec.md` 另行撰写；本 spec 的实现工作只需提供可运行的占位 SP 与占位 Skill，并按下文契约实现其余全部内容。

## User Stories

### 启动与作品

1. 作为作者，我想运行一个命令就开始一本新小说，不填标题、不导入资料，以便想到就写。
2. 作为作者，我想用同一个命令加作品路径或 ID 重新打开已有作品，开始一个新的写作任务，以便分次创作。
3. 作为作者，我想继续上一次未完成的写作任务并保留当时的对话，以便中断后接着聊。
4. 作为作者，我想每个新写作任务不继承上一个任务的对话，以便旧方案和废案不污染新任务。
5. 作为作者，我想作品目录是一个我不需要操作的 git 仓库，以便每次定稿和同步都有历史可查、可回滚。
6. 作为作者，我想在不同角色上配置不同的 DeepSeek 模型与 thinking 档位，以便权衡质量与成本。
7. 作为评估者，我想确认发给模型的提示词里没有任何编码助手默认内容、全局 AGENTS 文件、本机 Pi 配置或无关 Skill，以便实验结果只反映 Noya 自己的设计。
8. 作为作者，我想 Noya 运行时不联网下载任何可执行文件，以便环境可控。

### 讨论与设定

9. 作为作者，我想直接和 Context Agent 聊设定和剧情想法，它不会每句话都去生成正文，以便先把想法聊清楚。
10. 作为作者，我想问已有资料的问题并得到带来源的回答，以便确认之前定过什么。
11. 作为作者，我想让 Context Agent 把我确认的人物、世界、资料库条目、大纲节点写入作品，以便后续写作能用。
12. 作为作者，我想 Context Agent 只有引用我最近一条、且在上次写入之后说的话作为确认，才能写入正式资料，以便它不能把自己的建议偷偷变成设定，也不能拿我很久以前的一句"好"反复使用。
13. 作为作者，我想格式错误或引用了不存在对象的设定被拒绝写入，并看到拒绝原因，以便资料始终合法、互相可引用。
14. 作为作者，我想一次确认的多个相关设定（例如新人物及其功法）要么一起写入，要么都不写入，以便不出现半截资料。
15. 作为作者，我想 Context Agent 不能用文件编辑工具直接改正式资料，以便所有正式资料都经过校验和确认。

### 准备与派发写作

16. 作为作者，我想说"写下一章"后，Context Agent 按我接受的要求整理 Writing Brief、按需检索并整理 Context Pack，以便 Writer 拿到的是干净的输入。
17. 作为作者，我想 Context Pack 里每段材料都标明来源 ID，且来源必须真实存在，以便材料可回查、不凭空捏造。
18. 作为作者，我想在有待同步章节时既不能准备新 Package、也不能用旧 Package 派出 Writer，以便新章不会基于过期的人物状态。
19. 作为作者，我想 Writer 只能看到程序装配的 Writing Package，看不到我和 Context Agent 的讨论、废案和检索过程，以便它不被旧方案干扰。
20. 作为作者，我想 Writer 先交章节方案，Context Agent 检查过方案后再展开正文，以便方向问题在写正文前被纠正。
21. 作为作者，我想 Writer 生成期间我仍能和 Context Agent 说话，并让它把我的新想法在 Writer 下一次模型调用前送达，以便不必等几分钟。
22. 作为作者，我想每次发给 Writer 的消息都由程序自动附上最新 Brief，以便 Writer 总以当前要求为准，而不依赖 Context Agent 记得附上。
23. 作为作者，我想 Writer 完成时 Context Agent 会主动收到通知，而不是反复轮询，以便流程自然推进。
24. 作为作者，我想每轮对话 Context Agent 都能看到当前 Subagent 的状态摘要，以便它不会忘记有 Writer 在跑。
25. 作为作者，我想推翻方向重写时开新 Writer，而旧 Writer 自动退役，以便同一任务不会有两个 Writer 同时写。
26. 作为作者，我想能停止所有正在运行的 Subagent，被停止的 Writer 之后还能继续，以便及时止损又不丢进度。

### 对抗检查与返修

27. 作为作者，我想每份初稿都由一个全新会话的正文检查员按四项质量门禁检查，以便检查不受讨论和前一轮结论影响。
28. 作为作者，我想 Context Agent 无法给检查员或同步核对员发消息，以便它不能要求检查员改结论。
29. 作为作者，我想检查员提出的明确冲突必须附上 Brief 或 Pack 中的原文依据，且引用的正文摘录必须真的出现在被检查的稿件中，以便无依据的意见不能阻断交稿。
30. 作为作者，我想检查结论中四项状态与反馈条目保持一致（有冲突必为失败），以便结论可信。
31. 作为作者，我想 Context Agent 把附依据的问题连同位置和修正目标交给原 Writer 返修，修改后重新整章检查，以便问题真正被修复且不引入新问题。
32. 作为作者，我想同一问题反复修不好或问题不再减少时，Context Agent 把当前稿和检查结果交给我决定，以便不无限返修。
33. 作为作者，我想交稿时编辑建议附在后面但不阻断交稿，以便我自己决定是否采纳。
34. 作为作者，我想纯措辞修正可以由 Context Agent 直接在 Writer 工作文件上修改并另存新版本，以便小问题不必再派 Writer。

### 定稿与同步

35. 作为作者，我想只有我能通过命令定稿某一版初稿，模型无法自行定稿，以便正式正文只来自我的决定。
36. 作为作者，我想定稿后正文立即成为正式内容并提交 git，即使后续同步失败也不退回初稿，以便定稿可靠。
37. 作为作者，我想定稿后 Context Agent 自动开始 Context 同步，提出人物志、世界志、大纲、资料库和章节摘要的变化清单，每条变化附定稿正文中的原文依据，以便资料更新可追溯。
38. 作为作者，我想变化清单中引用的正文依据必须真实出现在定稿正文里，以便不能凭初稿或臆测入库。
39. 作为作者，我想由独立的同步核对员逐条核对变化是否有依据、是否与既有资料冲突，以便格式合法但内容错误的事实不入库。
40. 作为作者，我想只有被核对为"有依据"的变化可直接写入，无依据或冲突的变化必须经我确认才能写入，以便我掌握有争议的事实。
41. 作为作者，我想同步完成（章节摘要已填写）后待同步标记被清除，以便可以开始下一章。
42. 作为作者，我想可以重新定稿已定稿的章节，该章重新进入待同步并保留原顺序，以便修改旧章。

### 评估

43. 作为评估者，我想对一章运行对照比较：Noya 把同一 Writer 的"第一版初稿"与"最新初稿"随机标为甲、乙交给我盲读，以便判断检查返修是否让文章更好。
44. 作为评估者，我想模型读不到对照比较的甲乙映射，以便盲评不被污染。
45. 作为评估者，我想记录我在对照比较中的选择和理由，并在之后揭晓甲乙分别是哪一版，以便积累可统计的评估记录。
46. 作为评估者，我想对一个写作任务运行审计，得到各工具调用次数、被拒绝的调用及原因、Subagent 数量与轮数、各类产物版本数、返修轮数、各角色 token 与耗时，以便定位流程问题和成本。
47. 作为评估者，我想审计报告能看出 Context Agent 是否加载了应该加载的 Skill、是否跳过了方案检查或正文检查、是否反复派同步核对员"挑到满意为止"，以便判断软流程是否可靠。
48. 作为评估者，我想所有 Subagent 的会话也落盘并归属到对应写作任务，以便审计和复盘。
49. 作为评估者，我想替换 SP 或 Skill 文件后无需改代码即可重跑，以便快速迭代提示词。

## Implementation Decisions

### 模块

- **会话工厂**（最核心模块，也是唯一测试接缝）：给定作品、写作任务、角色与该角色的模型，构造一个配置完整的 Pi coding-agent 会话。启动器与测试共用它，不允许第二套会话配置。
- **启动器**：`noya` 命令，负责新建或打开作品、开始或恢复写作任务、把 Context 会话交给 Pi 交互界面；另提供 `noya audit` 子命令。
- **Noya 扩展**：按角色注册工具、作者命令、`tool_call` 路径守卫、每轮状态摘要、会话切换拦截。
- **作品存储**：正式区读写、schema 与一致性校验、原子写入、git 提交、进程级写锁。
- **任务工作区**：写作任务目录、不可变产物版本、Subagent 登记。
- **Subagent 运行时**：进程内用会话工厂创建子会话，管理生命周期、异步通知、状态摘要。
- **审计工具**、**对照比较**。
- **SP 与 Skills 文件**：实现时放置占位版本（四个角色各一份 SP、三个 Skill，内容只需让流程可演示），位置由配置指定，替换无需改代码。

### 依赖与运行环境

- 项目从零建立在仓库的 `v0/` 目录：Node ≥ 22.19、ESM、TypeScript。源码与测试由 Node 直接运行（类型擦除，只使用可擦除的 TypeScript 语法，不引入构建步骤）；测试用 Node 内置测试运行器；`tsc --noEmit` 做类型检查。所有依赖使用精确版本，提交 lockfile，`node_modules` 不入库。
- 直接依赖 `@earendil-works/pi-coding-agent@0.87.1` 与 `@earendil-works/pi-ai@0.87.1`（后者用于模型注册与测试用 faux provider；被 coding-agent 锁在其内部的副本不能直接引用）。ajv 8.17.1。开发依赖：`typescript@5.8.3`、`@types/node@22.15.3`。
- `rg` 是前置依赖：启动器检查 `rg` 可用，不可用时报错退出。内置 `find` 依赖的 `fd` 不要求：Noya 用 Node 文件系统 glob 实现 `find` 的操作并注册同名工具覆盖内置版本。
- 启动器与测试均设置 `PI_OFFLINE=1` 与 `PI_SKIP_VERSION_CHECK=1`，禁止 Pi 联网下载工具或检查版本。
- Noya 使用自己的空 Pi 配置目录（agentDir）与自己的认证文件路径，不读取本机 `~/.pi` 下的设置、认证、全局包、SYSTEM.md 或 APPEND_SYSTEM.md。

### 配置

`v0/` 目录下的一份 JSON 配置（可用环境变量 `NOYA_CONFIG` 指向其他文件），包含：

- 作品根目录。
- 每个角色（`context` / `writer` / `reviewer` / `sync_checker`）：provider（v0 固定 `deepseek`）、模型 ID、thinking 档位。
- SP 文件（每个角色一个）与 Skills 目录的位置。

模型：Pi 0.87.1 内置的 DeepSeek 模型为 `deepseek-flash`（thinking 档位 low/high/max）与 `deepseek-v4-pro`（high/max）。配置中的 thinking 档位必须是该模型支持的值，否则启动器报错退出，不允许 Pi 静默调整。配置了内置列表以外的模型 ID 时，配置中必须同时给出该模型的上下文窗口、最大输出和支持的 thinking 档位，启动器据此注册。密钥只从 `DEEPSEEK_API_KEY` 读取，不进入提示词、产物或会话。

### 会话工厂

- 用 Pi 的服务与会话接口构造会话；为了交给交互界面，工厂以 Pi"会话运行时工厂"的形式提供（交互界面只接受运行时对象，不接受单个会话）。
- 资源加载显式设定：系统提示词 = 该角色 SP 文件内容；追加系统提示词显式为空列表；关闭 AGENTS/CLAUDE 上下文文件、skills、extensions、prompt templates、themes 的自动发现；仅 Context Agent 通过显式路径加载 Noya Skills；Noya 扩展以内联工厂方式装入。
- 工具白名单按角色显式列出，**必须同时包含该角色的 Noya 工具名**（Pi 的白名单也过滤扩展工具）。Context Agent 的白名单必须包含 `read`（否则 Pi 不在提示词中列出 Skill）。
- 模型按角色注入：工厂与 Subagent 运行时接收"角色 → 模型"的映射。生产用 DeepSeek；测试为每个角色注册独立的 faux provider（用 pi-ai 的 `fauxProvider` 创建并注册到本会话的模型运行时，不使用全局注册的 `registerFauxProvider`），使主会话与各子会话按各自脚本运行。
- 模型会看到 Pi 固定追加的工作目录说明与 Skill 清单，这是预期内容。

### 启动器与写作任务

- `noya`：在作品根目录下新建作品：生成作品 ID；git init 并设置仓库本地的提交身份（`Noya <noya@localhost>`）；写入空大纲、空世界志、空同步状态；首次提交。然后开始新写作任务。
- `noya <作品>`：`<作品>` 可以是路径，或作品根目录下的作品 ID。开始新写作任务。
- `noya <作品> --continue`：恢复该作品最近一个写作任务的 Context 会话：按任务登记中记录的 Context 会话文件打开（不使用 Pi"取目录中最新会话"的方式，因为子会话文件也在同一处）；恢复后重新启用 Noya 工具；登记中仍标记为运行中或空闲的 Subagent 一律改为"已终止（进程退出）"。
- 每次启动（非 `--continue`）即一个新写作任务，拥有新的任务 ID、任务目录与 Context 会话。
- 交互界面启动前完成主题初始化。
- 扩展拦截 Pi 的会话切换与分叉（`/new`、`/resume`、`/fork` 等）：取消并提示作者"退出后用 noya 命令开始新任务或继续任务"。Subagent 登记放在模块级别，扩展重新实例化（如 `/reload`）时重新绑定，不丢失。

### 作品目录布局

- **作品目录**（git 仓库）：
  - **正式区**：章节（每章一个文件）、人物志（每人一个文件）、资料库（每条一个文件）、世界志（单文件）、大纲（单文件）、同步状态（单文件）。文件名即对象 ID。只由业务工具写入。
  - **任务区**：每个写作任务一个目录，内含：`artifacts`（不可变产物版本，任何角色的文件工具都不可写）、每个 Subagent 的工作目录或输入目录、任务登记（含 Context 会话文件路径与 Subagent 登记）、审计报告。任务区不纳入 git（写入作品的 `.gitignore`）。
- **运行时目录**（在作品目录之外，位于作品根目录下的隐藏运行时目录中，按作品 ID 分开）：所有 Pi 会话 JSONL（按任务归档），以及对照比较的甲乙映射。所有模型角色的文件工具都不可访问。

同步状态结构：`{ "schema_version": 1, "pending_chapter_ids": string[] }`。

### ID 与版本

- 所有正式资料 ID（章节、人物、资料库条目、世界志节点、大纲节点、持有物、认知记录）、Brief 的 `id` 与 `chapter_id`、同步变更 `id`，必须匹配 `^[a-z0-9][a-z0-9_-]{0,63}$`。在 schema 校验之后、写任何文件之前检查。
- 正式资料 ID 在整部作品内全局唯一（跨类型）。`save_package` 时即检查 `write_chapter` 的 `chapter_id` 不与任何非章节对象的 ID 冲突。
- 产物与 Subagent 按写作任务从 1 编号：`package_N`、`plan_N`、`draft_N`、`review_N`、`proposal_N`、`check_N`；`writer-N`、`reviewer-N`、`sync_checker-N`。工具参数中只用任务内 ID；审计、评估记录、git 提交信息对外引用时写成"任务 ID / 版本 ID"。

### 校验与错误约定

- 正式资料与产物 schema 用 ajv 的 2020-12 版本编译，选项：`strict: true`、`allowUnionTypes: true`、`coerceTypes: false`、`useDefaults: false`。
- Pi 会在执行前对工具参数做类型转换。凡需要严格校验的复杂参数，在工具的 `prepareArguments` 中用 ajv 校验原始参数；工具注册的参数 schema 可以宽松。
- **所有拒绝**（门禁拒绝、参数或 schema 校验失败、状态不允许）一律以工具错误返回，错误文本以 `[拒绝]` 开头，其后列出全部原因。审计按这个前缀统计。
- **逐字匹配规则**（用于检查结果摘录、依据摘录、同步依据、作者确认片段）：两边只把 CRLF 换成 LF，被匹配的片段去掉首尾空白；其余（Markdown 符号、全半角、内部换行）不做任何处理，然后做子串匹配。检查结果的 `location.excerpt`、`evidence.excerpt` 与同步依据摘录至少 4 个非空白字符。
- 所有写正式区或 git 的工具与作者命令都以顺序模式执行，并共用一把进程级写锁。

### 正式资料 schema 与一致性

v0 覆盖五类：章节、人物志、世界志、大纲、资料库。直接采用 `docs/design/context-types.md` 中的 Chapter、CharacterProfile、WorldGuide、Outline、LibraryEntry schema，不删减字段。伏线与笔法不在 v0。

schema 之外的校验，在"应用整批变更后的完整状态"上执行（因此同一批次内新建并引用是允许的）：

- ID 格式与全局唯一（见上）。
- 引用存在：章节与大纲节点的 `key_characters` → 人物；大纲节点 `chapter_ids`、认知 `source_chapter_ids` → 章节；人物 `state.location_id`（非 null）→ 世界志节点；`abilities[].entry_id`、`possessions[].entry_id`（非 null）→ 资料库条目；`relationships[].character_id` → 其他人物。
- 唯一性：同一人物的 `state.attributes[].key`、`resources[].key`、`abilities[].entry_id` 各自不重复；资料库条目 `attributes[].key` 不重复；大纲节点 `id`、`order` 各自唯一；同一持有物 ID 不能出现在两个人物的持有列表中。
- `context-types.md` 中写明"由存储层另行校验"的其他规则一并实现。
- 世界志：v0 为单文件，任何只含 `ref_id` 的子节点引用一律拒绝。
- 删除被引用的对象被拒绝，并列出引用方。

### 任务产物

| 产物 | 格式 | 产生方式 | 校验 |
|---|---|---|---|
| Writing Package | Brief（JSON，`writing-brief.md` 的 WritingBrief schema）+ Pack（Markdown） | `save_package` | 见下 |
| 章节方案 | Markdown | Writer 写工作目录中的方案文件，`submit_plan` 快照 | 非空 |
| 初稿 | Markdown；第一个非空行为 `# 标题`，其后为正文 | Writer 写工作目录中的初稿文件，`submit_draft` 快照；或 Context Agent 修改后 `save_revision` 快照 | 标题行存在、正文非空 |
| 检查结果 | JSON，`chapter-review.md` 的 ChapterReview schema | `save_review` | 见下 |
| 同步变更清单 / 核对结果 | JSON | `save_sync_proposal` / `save_sync_check` | 见"同步" |

产物一经保存即为不可变版本，存放在任务区 `artifacts` 中。

**Brief 规则**：`write_chapter` 的 `chapter_id` 不能是已定稿章节，也不能与非章节 ID 冲突；`rewrite_chapter` 的必须是已定稿章节。

**Pack 解析规则**：以行首 `## ` 划分段落；第一个 `## ` 之前除空白外不允许有内容；`###` 及更深标题归入所在段落；代码块内的 `## ` 不算段落。每个段落恰好一行匹配 `^来源[：:]\s*(.+)$`；ID 之间用 `、`、`,`、`，` 或空白分隔；`无` 只能单独出现，表示该段是明确未知。列出的 ID 必须是存在的正式资料 ID（任意类型，含持有物、认知记录），不能是 Brief ID。

**初稿归属**：每个初稿版本记录它的 Writer 和提交时该 Writer 绑定的 Package。`save_revision` 继承活跃 Writer 的绑定。

**检查结果规则**：除 schema 外，满足 `chapter-review.md` "Schema 之外的一致性校验"第 1、2、4 条；`chapter_id` 等于被检查初稿所属 Brief 的 `chapter_id`；每条 `location.excerpt`（非 null）逐字出现在被检查初稿中；每条 `evidence`：若 `source_id` 等于 Brief 的 `id`，`excerpt` 必须逐字出现在 Brief 的某个字符串值中；否则 `source_id` 必须出现在 Pack 某个段落的来源行中，且 `excerpt` 逐字出现在来源行包含该 ID 的某个段落正文中。不查询正式区（检查员只看得到 Brief 与 Pack）。

### 作者消息与作者确认

- **作者消息**：当前会话中角色为 user 的消息。Noya 注入的通知、状态摘要、`/finalize` 发出的同步请求都以自定义消息发送，不属于作者消息。一律从会话记录推导，保证 `--continue` 后仍成立。
- **作者确认**（`write_canon`、`apply_sync` 使用）：`author_confirmation` 去掉首尾空白后非空且不全是标点；逐字出现在作者最近一条消息中；该消息晚于本会话中最近一次成功的 `write_canon` 或 `apply_sync`。
- 已知风险（接受）：作者手动输入 `/skill:…` 时，Skill 全文会展开进作者消息，模型可能从中摘取确认片段。v0 约定作者不使用该命令，审计中可见。

### Context Agent 的工具与权限

| 工具 | 行为 |
|---|---|
| `query_canon` | 只读。`search`（关键词扫描正式区全文，可按类型过滤，返回类型、ID、标题、片段）、`get`（按 ID 批量取，去重）、`list`（按类型列 ID/标题/摘要）、`subtree`（世界志子树，可限深度）。v0 不建索引。 |
| `write_canon` | 见附录。不接受章节变更。整批在内存中应用并校验，任何一项失败整批拒绝并返回全部错误；通过则原子写入并提交一次 git。 |
| `save_package` | 见"任务产物"。同步状态中存在待同步章节时拒绝，原因列出待同步章节。 |
| `save_revision` | 把当前活跃 Writer 的初稿工作文件快照为新初稿版本。Writer 运行中时拒绝。 |
| `save_sync_proposal`、`apply_sync` | 见"同步"。 |
| Subagent 工具 | 见"Subagent"。 |
| 内置工具 | `read`、`grep`、`find`（Noya 实现）、`ls`、`edit`。 |

Context Agent 的工作目录为作品目录。文件范围：可读作品目录与 Skills 目录；`edit` 只允许作用于当前活跃 Writer 的方案或初稿工作文件，且该 Writer 不在运行中；不能访问运行时目录与其他作品。

### Subagent

工具（参数见附录）：

- `spawn_subagent`：立即返回 `agent_id`，子会话在后台运行。
  - `writer`：输入为 `package_id`。同步状态存在待同步章节时拒绝。程序把 Brief 与 Pack 写入该 Writer 工作目录的输入子目录，并装配为首条消息。本任务已有的活跃 Writer 自动停止并标记为已退役。
  - `reviewer`：输入为 `draft_id`，Package 由程序按初稿归属反查。**每次都是新会话**，只注入 Brief、Pack、该初稿版本（同时写入它的输入目录）。
  - `sync_checker`：输入为 `proposal_id`。程序把变更清单与该章定稿正文写入它的输入目录。
  - 不接受任何自由文本 prompt。
- `send_message`：**只接受 Writer**；对检查员与同步核对员一律拒绝。Writer 运行中时，消息在其下一次模型调用前送达（Pi 的 steer 语义，不会打断正在生成的文字）；空闲或已停止时开始新一轮；已退役、已终止或失败时拒绝。可选 `package_id` 用于改绑：新 Package 的 `chapter_id` 必须与原绑定相同。程序在每条消息后自动附上该 Writer 当前绑定 Package 的 Brief 全文。
- `stop_subagent`：中止当前轮，保留会话，状态为已停止。
- `get_subagents`：无参返回本任务所有 Subagent 的简要状态；有参返回角色、状态（运行中 / 空闲 / 已停止 / 已退役 / 已终止 / 失败）、输入引用、最近产物 ID、失败原因。

角色工具与文件范围：

| 角色 | Noya 工具 | 内置工具 | 工作目录 / 文件范围 |
|---|---|---|---|
| Writer | `submit_plan`、`submit_draft`（首次 `submit_draft` 前必须已提交过方案） | `read`、`grep`、`write`、`edit` | 该 Writer 的工作目录（含输入子目录、方案文件、初稿文件） |
| 正文检查员 | `save_review` | `read`、`grep` | 本次检查的输入目录（只读） |
| 同步核对员 | `save_sync_check`、`query_canon` | `read`、`grep` | 本次核对的输入目录（只读） |

**路径守卫**（`tool_call` 钩子）：对每个内置文件工具的路径参数（`read`/`edit`/`write` 的必填 `path`；`grep`/`find`/`ls` 的可选 `path`，缺省为 `.`），按 Pi 的解析方式还原真实目标：去掉开头的 `@`、展开 `~`、支持 `file://`、规范化 Unicode 空白、相对会话工作目录解析，再取真实路径（目标不存在时取最近一个已存在祖先目录的真实路径拼接剩余部分）。目标不在该角色允许范围内，或是某个禁区的祖先目录（会导致搜索进入禁区）时拒绝。

**子会话运行**：

- 子会话以 Pi 的"会话就绪（settled）"事件作为一轮结束的信号（结束后可能还有自动重试）。
- 后台运行的 prompt 必须捕获错误，错误记为该 Subagent 失败并通知，不能让未处理的异常影响交互界面。
- 子会话不绑定 Context 工具调用的中止信号：作者按 Esc 只中止 Context 当前轮，不中止 Subagent。
- 子会话需完成扩展绑定，使 Noya 工具与守卫生效。

**通知与状态**：

- 子会话一轮结束（完成、失败或被停止）时，程序向 Context 会话发送自定义消息，以 followUp 方式送达并触发一轮。本轮提交了产物：`[writer-1 完成] 本轮提交：plan_1、draft_1`（列出全部）；未提交：`[writer-1 结束，未提交产物] <最后回复前 200 字>`；失败或停止附原因。通知不含产物全文。
- 状态摘要：在每次向 Context Agent 的模型发出请求前，通过 Pi 的 `context` 事件临时附加一行当前 Subagent 状态摘要。该行不写入会话记录；审计从 Subagent 登记还原状态。
- Subagent 登记（ID、角色、会话文件、输入引用、状态、产物、每轮开始与结束时间）写入任务登记，供 `--continue` 与审计使用；v0 不据此恢复运行中的 Subagent。

### 作者命令

- `/finalize [draft_id]`：默认取本任务最新初稿。章节 ID 取自该初稿所属 Brief 的 `chapter_id`；标题取第一个非空行的 `# ` 之后内容；正文取其后部分。新章 `order` = 现有最大值 + 1；重新定稿保留原 `order`。写入 `status: finalized`、`summary: ""`、`key_characters: []`；把章节加入待同步列表；章节文件与同步状态原子写入并一次提交。随后以自定义消息（不是作者消息）通知 Context Agent 并触发一轮："<章节 ID> 已定稿，请进行 Context 同步"。模型无法调用此命令，任何角色都没有能写章节正文的工具。
- `/stop`：停止本任务所有运行中的 Subagent。
- `/compare`、`/compare-pick`：见"对照比较"。

### 同步

- `save_sync_proposal`：`chapter_id` 必须在待同步列表中。每条变更含 `id`、`change`（`write_canon` 的全部变更类型，外加仅同步可用的 `chapter_meta` 变更，且只能针对本清单的 `chapter_id`）、`evidence`（至少一条，每条逐字出现在该章正式正文中）、`rationale`。整份清单在内存中试应用并通过全部校验才保存。
- `save_sync_check`（同步核对员）：对清单中每条变更恰好一条结论；`verdict` ∈ `supported` / `unsupported` / `conflict`，附 `reason`；`conflicting_ids` 在 `conflict` 时非空且 ID 存在，其他情况为空。同一清单可以有多份核对结果，以最新一份为准。
- `apply_sync`：该清单必须已有核对结果。所选变更中有非 `supported` 的，必须提供满足"作者确认"规则的 `author_confirmation`，否则整批拒绝。整批校验、原子写入、一次提交；应用后若该章 `summary` 非空，则在同一次提交中把该章移出待同步列表。
- 同步失败时正式正文保持不变。

### 原子性与 git

- 每次正式区写入：先在内存中得到完整结果并校验，写临时文件后 rename，最后提交。提交只 `git add` 本次写入或删除的文件（删除也要记入提交）。提交信息标明操作、对象 ID，以及相关的"任务 ID / 版本 ID"。
- 提交前若正式区存在其他未提交修改，照常只提交自己的文件，并在工具结果中列出这些修改，由 Context Agent 告知作者。

### 对照比较

对照比较不额外生成稿件：Writer 在检查之前交出的第一版初稿就是"不经对抗检查"的产物。

- `/compare`：取本任务最新初稿，以及与它同一个 Writer 的第一个初稿版本（两者相同则提示无法比较）；随机映射为甲、乙；写成两个只含标题与正文的文件，告诉作者路径。映射保存在运行时目录中，任何模型角色都读不到，也不出现在发给模型的任何消息里。
- `/compare-pick 甲|乙|都不好 [理由]`：把任务 ID、章节 ID、两版 ID、映射、选择、理由、两版字数（汉字数）、两版之间的检查结果数量、时间追加写入作品级评估记录（放在运行时目录），然后揭晓映射。

### 审计

`noya audit <作品> [任务]`（缺省为最近任务）读取该任务 Context 与全部 Subagent 会话及产物，输出 Markdown 报告到任务目录，并在终端打印路径。内容：

- 各角色、各工具的调用次数；被拒绝的调用（错误文本以 `[拒绝]` 开头）列出工具、角色、原因。
- 加载了哪些 Skill（以读取 Skill 文件为准）及次数。
- 各类产物版本数；每份同步清单的核对次数。
- 检查覆盖：每个初稿版本是否有检查结果；被定稿或最后交给作者的初稿及其最近一次检查的四项结论；没有检查就被定稿的初稿单独标出。
- 各角色输入 / 输出 token 与墙钟耗时。
- 以"未提交产物"结束的 Subagent 轮次。

## 附录：工具参数

以下为类型形状（TypeScript 记法），是契约的一部分。`Id` 指匹配 ID 格式的字符串。

```ts
// Context Agent
query_canon:
  | { op: "search"; query: string; types?: CanonType[]; limit?: number }   // limit 缺省 20
  | { op: "get"; ids: Id[] }
  | { op: "list"; type: CanonType }
  | { op: "subtree"; id: Id; depth?: number }
type CanonType = "chapter" | "character" | "library" | "world_node" | "outline_node"

write_canon: { author_confirmation: string; changes: CanonChange[] }       // changes 至少一条
type CanonChange =
  | { type: "character"; op: "upsert"; doc: CharacterProfile }
  | { type: "character"; op: "delete"; id: Id }
  | { type: "library"; op: "upsert"; doc: LibraryEntry }
  | { type: "library"; op: "delete"; id: Id }
  | { type: "world_node"; op: "upsert"; parent_id: Id | null;
      node: { id: Id; kind: string; title: string; summary: string; content: string } }
      // 新节点追加到父节点 children 末尾（parent_id 为 null 时追加到顶层）；
      // 已有节点：parent_id 必须等于当前父节点（v0 不支持移动），只替换这五个字段，保留 children
  | { type: "world_node"; op: "delete"; id: Id }                          // 仅限无下级节点
  | { type: "outline_node"; op: "upsert"; node: OutlineNode }
  | { type: "outline_node"; op: "delete"; id: Id }

save_package: { brief: WritingBrief; pack: string }            // 返回 package_id
save_revision: {}                                              // 返回 draft_id

spawn_subagent:
  | { role: "writer"; package_id: string }
  | { role: "reviewer"; draft_id: string }
  | { role: "sync_checker"; proposal_id: string }              // 返回 agent_id
send_message: { agent_id: string; message: string; package_id?: string }
stop_subagent: { agent_id: string }
get_subagents: { agent_id?: string }

save_sync_proposal: {
  chapter_id: Id;
  changes: { id: Id; change: CanonChange | ChapterMetaChange; evidence: string[]; rationale: string }[];
}                                                              // 返回 proposal_id
type ChapterMetaChange = { type: "chapter_meta"; chapter_id: Id; summary: string; key_characters: Id[] }
apply_sync: { proposal_id: string; change_ids: Id[]; author_confirmation?: string }

// Writer
submit_plan: {}     // 快照工作目录中的方案文件，返回 plan_id
submit_draft: {}    // 快照工作目录中的初稿文件，返回 draft_id

// 正文检查员
save_review: { review: ChapterReview }                         // 被检查的初稿由会话输入确定

// 同步核对员
save_sync_check: {
  verdicts: { change_id: Id; verdict: "supported" | "unsupported" | "conflict";
              reason: string; conflicting_ids: Id[] }[];
}                                                              // 核对的清单由会话输入确定
```

方案文件与初稿文件在 Writer 工作目录中的文件名由实现固定，并写入 Writer 首条消息。

## Testing Decisions

- **唯一接缝：会话工厂。** 测试在临时目录新建作品，用会话工厂构造真实的 Noya 会话（真实的扩展、工具、钩子、存储、git），每个角色使用各自的 faux provider 按脚本输出工具调用。只断言外部可观察结果：工具结果与拒绝原因、作品目录文件内容、git 提交（数量、包含的文件、提交信息）、推送给 Context 会话的通知、发给模型的系统提示词与工具列表。不测试内部函数、不 mock 存储或 git。
- 测试环境设置 `PI_OFFLINE=1`；测试用临时的 Noya 配置目录，不读取本机 Pi 配置。
- **好测试的标准**：一条测试对应一条用户可感知的规则，读测试名就知道规则；换一种内部实现不需要改测试。
- **必须覆盖的门禁**（每条至少一个拒绝用例和一个通过用例）：
  - 启动配置：系统提示词只含 Noya SP、Skill 清单与工作目录说明；作品目录中的 AGENTS.md 不被加载；各角色工具列表与本 spec 一致，无 `bash`；不联网。
  - 作者确认：片段不在最近一条作者消息中 → 拒；最近一条作者消息早于上次写入 → 拒；通知消息中的文字不能作为确认。
  - `write_canon`：schema 错误、悬空引用、ID 格式非法 → 拒；同批新建并引用 → 通过；任一项失败整批不落盘；成功只提交一次且只含本次文件。
  - 路径守卫：Context 用 `edit` 改正式区、读运行时目录被拒；Writer 读任务区以外被拒；检查员写文件被拒；以禁区祖先目录为搜索根被拒。
  - `save_package` / `spawn_subagent(writer)`：有待同步章节时拒绝；Pack 解析与来源 ID 校验。
  - Subagent：`spawn_subagent` 立即返回；完成后 Context 收到只含产物 ID 的通知；新 Writer 使旧 Writer 退役；`send_message` 发给检查员或核对员被拒；已停止的 Writer 收到消息后开始新一轮；每次检查员为新会话；Writer 未交方案先交初稿被拒；Writer 收到的每条消息末尾附有最新 Brief。
  - `save_review`：摘录不在初稿中、依据摘录不在对应 Pack 段落中、结论与反馈不一致、`violation` 无证据 → 拒。
  - `/finalize`：模型无对应工具；定稿写入章节、加入待同步、一次提交；同步请求不是作者消息。
  - 同步：证据摘录不在定稿正文中 → 拒；`chapter_meta` 针对其他章节 → 拒；无核对结果不能应用；非 `supported` 变更无确认被拒；摘要填好后待同步清除，随后 `save_package` 恢复可用。
  - 对照比较：选中的两版正确；映射不出现在 Context 会话中，模型读不到映射文件。
  - 审计：对一个脚本化任务，报告中的调用次数、拒绝次数、版本数与脚本一致。
- **不做自动化测试的部分**：SP 与 Skills 的效果、真实 DeepSeek 调用、交互界面的人工操作。
- **先例**：仓库尚无代码与测试。faux provider 的用法参考 pi-ai 发布包中 faux provider 的类型声明，以及 Pi 源码仓库 coding-agent 包自身的测试。`docs/research/pi-usage-guide-2026-09-25.md` 第 5 节验证的是更底层的 AgentHarness，不能直接当作本接缝的先例。

## Out of Scope

- 伏线、笔法两类资料；世界志分文件（`ref_id`）与索引。
- 崩溃后的 Subagent 恢复、未完成指令重发、技术失败后自动重试同步、多进程并发打开同一作品。进程退出即视为 Subagent 终止；`--continue` 只恢复 Context 会话。
- 世界志节点移动。
- 旧章重新定稿后对后续章节同步过期的标记与提示。
- 导出、历史回退、多书切换 UI、任何前端。
- 作者对 Pi 界面体验的优化（v0 接受 Pi 原生终端界面）。
- "无进展"停止条件的代码判定（v0 由 Skill 软约束，靠审计观察）。
- SP 与 Skills 的正式内容（见 `.scratch/noya-v0-prompts/spec.md`）。
- DeepSeek 以外的 provider。

## Further Notes

与依据文档的差异（本 spec 为准）：

1. **目录限制**：架构稿 §4.3 与 ADR 0005 称 MVP 不在代码中限制目录。v0 通过 `tool_call` 钩子按角色限制内置工具路径：成本低，且 Writer 能读到 Context 会话文件会直接破坏 ADR 0001 的隔离。
2. **崩溃恢复**：ADR 0005 描述"重新打开会话并重发未完成指令"，ADR 0002 描述"技术失败立即重试同步、中断后恢复时重试"。v0 都不实现：定稿后立即触发一次同步，失败或中断后由作者或 Context Agent 重新发起。
3. **索引**：ADR 0004 要求派生的本地索引。v0 不建索引，`query_canon` 直接扫描文件；五类资料体量在 v0 足够小。
4. **作者确认**（架构稿 §7 第 3 项）：确认片段必须逐字出现在作者最近一条消息中，且该消息晚于上次写入。它只证明作者刚说过这句话，不证明作者理解了变更内容；审计时观察是否足够。
5. **同步流程**（架构稿 §2.4、§7 第 4 项）：具体化为"变更清单 → 核对结果 → 按结论应用"三步，非 `supported` 变更需作者确认。
6. **`input_ref`**（架构稿 §3.3 第 1 条）：v0 为 `package_id`（Writer）、`draft_id`（检查员）、`proposal_id`（核对员）。
7. **章节摘要与重要登场角色**由同步填写，定稿时为空；这符合 context-types 中"空摘要只作编辑中占位"的规定；待同步清除的条件是摘要非空。
8. **对照比较**使用同一 Writer 的第一版初稿作为"无对抗检查"对照，不额外生成；它与最终稿共享同一份方案，比较的是检查返修环节本身的价值。
9. **steer 语义**：架构稿 §2.2 写"插入当前生成"。Pi 的 steer 在下一次模型调用前送达，不打断正在生成的文字。
10. **附上最新 Brief**：ADR 0001 要求返修消息附最新 Brief。v0 由程序自动附加，不依赖 Context Agent。
11. **`send_message` 只对 Writer**：架构稿 §3.1 未限制角色；v0 禁止给检查员与核对员发消息，防止要求其改结论。
12. 每次启动 `noya` 即一个写作任务，与架构稿"一次对话即一个任务"一致。
