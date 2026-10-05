# Writing tasks implementation validation

日期：2026-10-05。基线 `f9dd0cd23baaef0ba6c0c7f7787d99c0dbfbf774`；实现于当前分支 `docs/pi-subagent-architecture`。本次提交排除原有 README、包配置、启动器和模型配置改动。

## 实现

- 真实页面提供轻量任务入口、按创建时间排序的任务列表、新建与空白态；沿用既有纸墨视觉、正文阅读和 Agent 记录，补充窄屏、焦点返回、减少动态效果与常见 Markdown 标题排版。
- `/api/tasks` 以持久创建请求去重；`/api/state?work=…&task=…`、读取稿件和全部命令指向完整 TaskRef。只查看不启动模型，非最新任务可以继续，单条损坏记录不隐藏其他任务。
- 当前选择保留每个标签页的独立值；输入、稿件引用、正文阅读与滚动按作品/任务保存。创建、快照、正文和发送响应核对原目标；旧版偏好只迁移一次，归属不明时保留并要求作者确认。
- Context 读取/列举/搜索只允许本任务、正式资料和流程技能。每轮提供本任务产物的明确路径；运行占用区分正在查看与实际执行的完整任务身份。
- 同步归属包含定稿事件、任务、稿件和正文指纹；相同正文重新定稿仍是新事件。旧清单与旧决定失效。明确承接在写入锁和全局占用内完成；停止与待决定均不能被新任务绕过。
- 定稿将准备好的正文文件原子替换，登记其文件身份以区分替换前后。正式内容及 Git 提交完成后才标记登记完成。启动、同进程继续和读取可修复已安装的未完成登记；持久化仍失败时保留待同步错误并阻止新写作。它是本机文件恢复依据，不替代正式正文。

## 自动化

`cd v0 && npm run typecheck`、`npm run build` 通过。最终全量 `npm test`：**88/88**，包括新增 **18** 项多任务测试；输出见 [test-suite.txt](evidence/test-suite.txt)。模型响应在共享 ModelRuntime 边界替换；应用、HTTP、会话、角色工具、存储和 Git 均真实运行。故障注入覆盖实际文件重命名，未 mock 内部编排。

| 规格验收组合 | 证据 |
| --- | --- |
| 并发创建、同请求重启重试、并发首次打开 | writing-tasks：创建持久去重、损坏隔离/首次打开 |
| A 临时标记不进入 B；直接读、根目录 grep/find/ls 被拒 | writing-tasks：工具隔离；当前任务与 canon 读取成功 |
| 同局部稿件编号、返回非最新任务修改、旧 Writer 退出 | writing-tasks：相同编号重启修改；local-app 原有交稿/修改链路 |
| 同作品运行时新建/浏览，停止停稳、待决定释放 | writing-tasks：运行/停止/决定；local-app 覆盖三种子角色停止 |
| 承接与消息竞争、引用校验和停止竞争 | writing-tasks：两种承接顺序、引用消息紧接停止 |
| 正式资料更新使旧确认失效 | local-app 正式资料确认测试；writing-tasks 相同正文重新定稿使旧决定失效 |
| 非负责任务保存或应用同步、待同步写作门禁 | writing-tasks 同文重新定稿；records 旧清单失效；真实模型 B 写作被拒并指回 A |
| 唯一旧章承接、跨任务/重启找回 | writing-tasks 旧章节并发承接；browser-sync 第三任务返回已停止的承接者 |
| 同文/异文定稿中断、恢复不回退正文或旧归属 | writing-tasks 四种文件失败组合，并校验 Git HEAD |
| 归属失败后不重启直接同步 | writing-tasks 两种正文组合，真实同步工具完成 |
| 正文保存但 pending 标记失败 | writing-tasks 持续失败时仍阻止执行，移除故障后同进程修复 |
| 中断 A 后新建空白 B，恢复找到 A | writing-tasks 启动扫描；local-app 作者停止不自动恢复 |
| 旧 CLI、订阅回放、临时文件行为保持兼容 | session、cli、subscription、records 全量通过；文件工具夹具移至允许的任务目录 |

## 可交互页面与浏览器

没有另建一套静态原型；可控模型入口直接运行本次真实 UI，作为可点击原型和验收环境：

```sh
cd v0
npm run build
node --disable-warning=ExperimentalWarning test/manual-writing-tasks.ts
# 旧数据承接场景：
NOYA_LEGACY=1 node --disable-warning=ExperimentalWarning test/manual-writing-tasks.ts
```

输出提供独立临时作品和本机地址。在浏览器选中有两个任务的作品后，可用 `playwright-cli run-code --filename=…` 运行以下脚本：

- [browser-check.js](browser-check.js)：A/B 输入保存、非最新任务刷新、两个标签页独立选择、迟到发送不污染 B、创建不跳转另一页、准确返回执行任务、Escape 焦点、390px 布局、减少动态效果。11 项通过，无页面脚本错误。
- [browser-races.js](browser-races.js)：延迟创建响应、创建成功但响应丢失后重试、旧偏好归属不明、作者确认后只迁移一次、失效选择后恢复健康任务。5 项通过。网络错误是有意注入的响应丢失。
- [browser-sync.js](browser-sync.js)：明确承接、跨作品占用与输入、从另一作品准确停止、第三条任务返回已停止的承接者、作品/任务对话框交替与焦点。5 项通过。

运行输出与截图位于 [evidence](evidence/)。界面未引入正文编辑器、任务删除或并行执行。

## 独立代码审查

按 code-review 技能分别进行 Standards 与 Spec 审查。

### Standards

初审发现未完成定稿覆盖旧归属、轮询重复读取与恢复缺失 Git 提交；均已修复。复核未发现新的重大正确性问题或明确文档规范违反。

### Spec

初审及复核发现承接/引用消息/停止之间的异步竞争，以及定稿中断后 inode 被后续同步替换、pending 标记缺失的恢复缺口；均添加应用边界回归并修复。最终针对性复核 6 项通过，无未关闭问题。

审查不是浏览器或真实模型验收的替代。两轴当前未关闭发现均为 0。

## 真实模型旅程

使用 `test/manual-live.ts` 和现有 ChatGPT 订阅运行时，四角色均为 `gpt-6.1-sol`，保留本机配置中的 `xhigh`。独立作品 `w57682a0e`；A `t652ad72c`，B `t0378cbc1`。未触碰日常作品。

1. A 经页面确认保存青石镇/老钟楼正式资料，再保存 237 字《钟楼前》未定稿短稿。临时备选“杏色纸船”只留在 A 的讨论，未写入正文或正式资料。
2. B 从空白建立，只查询正式世界志，明确不知道 A 的临时暗号；其未采纳建议未写入资料。
3. 返回非最新的 A，经一次服务重启后读取第一版、引用并将“细沙”改为“沙粒”。第二版保存并检查，第一版保留，B 没有稿件。
4. 在页面明确对第二版定稿，正文立即正式保存。转到 B 可看见 A 的实际执行与同步归属；从 B 停止 A 后，B 请求下一章，save_package 被门禁拒绝且指回 A，没有接管同步或启动 Writer。
5. 通过“返回同步任务”回 A，再明确继续；真实同步核对、人物志、世界志、大纲及章节摘要写入完成，待同步列表清空，正文仍为第二版。

首次真实运行发现 Context 只收到产物 ID 后猜错目录；已修复为每轮提供确切当前产物路径，随后方案读取与交稿成功。此记录区分实际遇到的失败与修复后的完成结果，不以模型自述代替保存结果。

6. 回到 B 明确继续后，真实 `save_package` 成功保存 `package_1`，按作者要求未派 Writer、未生成正文。随后重新选择 A 的第二版并重启服务；页面恢复非最新 A 与第二版，A 的新消息只读核对了当前正式正文与同步结果，没有重发旧请求。
7. 浏览器实测恢复阅读滚动 `140px` 与对话滚动 `120px`，两者切换前后相同；新浏览器首次从本机偏好恢复时也写入本标签页选择，避免之后受其他页的最后选择影响。

可复核保存摘要见 [live-result.json](evidence/live-result.json)，重启与位置检查见 [browser-restart.txt](evidence/browser-restart.txt)、[browser-reader-position.txt](evidence/browser-reader-position.txt)。正文逐字比较证明唯一修改为“细沙”→“沙粒”；第二版去除 Markdown 标题后与正式正文一致。临时暗号不出现在 B 的页面记录或正式资料中。截图 [live-finalized.png](evidence/live-finalized.png) 展示实际定稿阅读状态。

所有验收服务器均使用独立临时作品；这些结果证明身份、保存、门禁、同步和恢复行为，不是小说文学质量评估。跨进程并行协调仍不在范围内。工单 `ready-for-human` 表示等待作者实际日常使用反馈，无已知未完成实现项。
