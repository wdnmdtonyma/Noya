# 01 — 启动器 + 会话工厂 + 测试基座

**What to build:** 作者在终端运行 `noya`，不填任何信息，就得到一本新的空作品，并进入 Pi 交互界面与 Context Agent 聊天。`noya <作品>` 打开已有作品开始新的写作任务，`noya <作品> --continue` 恢复该作品最近一个写作任务的对话。Context Agent 的会话由会话工厂构造：只含 Noya 的 SP 与 Skills，不读取本机 Pi 配置，不加载 AGENTS/CLAUDE 文件与任何自动发现的资源，内置工具按角色白名单启用、不含 `bash`，`find` 由 Noya 用 Node 实现，全程不联网。同一个会话工厂供测试使用：测试可在临时目录建作品，为每个角色注入各自的 faux 模型，并检查发给模型的系统提示词与工具列表。

契约详见 `.scratch/noya-v0/spec.md`："依赖与运行环境"、"配置"、"会话工厂"、"启动器与写作任务"、"作品目录布局"、"ID 与版本"、"校验与错误约定"、"Testing Decisions"。

SP 与 Skills 的正式内容不在本 ticket 内：放置占位 SP（四个角色各一份，一两句话即可）和三个占位 Skill（写一章 / 同步 / 问答，Pi 的 SKILL.md 格式），位置由配置指定，替换文件无需改代码。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] 依赖加入 `@earendil-works/pi-ai@0.87.1`（精确版本）；启动器检查 `rg` 可用，否则报错退出
- [ ] 配置：作品根目录；四个角色各自的 provider（`deepseek`）、模型 ID、thinking 档位；SP 文件与 Skills 目录位置；支持 `NOYA_CONFIG` 覆盖配置文件位置
- [ ] 配置校验：thinking 档位必须是该模型支持的值（`deepseek-flash`：low/high/max；`deepseek-v4-pro`：high/max）；内置列表以外的模型 ID 必须附上下文窗口、最大输出与支持档位，并据此注册；否则报错退出
- [ ] Noya 使用自己的空 Pi 配置目录与认证文件路径；启动器与测试设置 `PI_OFFLINE=1`、`PI_SKIP_VERSION_CHECK=1`
- [ ] 会话工厂：显式系统提示词 = 角色 SP；追加系统提示词显式为空列表；关闭上下文文件、skills、extensions、prompt templates、themes 的自动发现；仅 Context 显式加载 Noya Skills；Noya 扩展以内联工厂装入；工具白名单按角色显式列出并包含该角色的 Noya 工具名；以 Pi 会话运行时工厂的形式提供；接收"角色 → 模型"映射
- [ ] Noya 实现的 `find`（Node 文件系统 glob）以同名工具覆盖内置 `find`
- [ ] `noya` 无参数：新建作品（生成符合 ID 格式的作品 ID、git init、设置仓库本地提交身份 `Noya <noya@localhost>`、写入空大纲、空世界志、空同步状态 `{schema_version:1,pending_chapter_ids:[]}`、作品 `.gitignore` 忽略任务区、首次提交），开始新写作任务，初始化主题后进入 Pi 交互界面
- [ ] `noya <作品>`：接受路径或作品 ID；开始新写作任务，新任务的 Context 会话不含以往任务的对话
- [ ] 每个写作任务有任务 ID、任务目录与任务登记；Context 会话 JSONL 保存在作品目录之外的运行时目录中，路径记入任务登记
- [ ] `noya <作品> --continue`：按任务登记中的 Context 会话文件恢复（不取"目录中最新会话"），恢复后重新启用 Noya 工具
- [ ] 扩展拦截 Pi 的会话切换与分叉（`/new`、`/resume`、`/fork`），提示作者退出后用 noya 命令开始或继续任务
- [ ] 建立"拒绝"约定的公共实现：所有拒绝以工具错误返回，文本以 `[拒绝]` 开头
- [ ] 测试基座：临时目录建作品、临时 Noya 配置目录、每个角色独立的 faux provider（用 pi-ai 的 `fauxProvider` 创建并注册到本会话的模型运行时，不用全局 `registerFauxProvider`）、读取发给模型的上下文
- [ ] 测试：Context 系统提示词含占位 SP 与 Skill 清单，不含 Pi 默认编码助手提示词；作品目录中放 AGENTS.md 不被加载；本机 Pi 配置目录中的内容不被读取
- [ ] 测试：Context 可用工具恰为 `read`、`grep`、`find`、`ls`、`edit`（及后续 ticket 添加的 Noya 工具），不含 `bash`、`write`；调用 `find` 不触发任何下载
- [ ] 测试：新建作品后 git 有一次初始提交，提交身份为 Noya；任务区被忽略；`--continue` 打开的是 Context 会话而非同目录下其他会话
