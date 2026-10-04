# v0 能力核对基线

核对日期：2026-10-04。依据当前工作区代码与既有验收记录；本轮没有运行模型、登录或重新执行验收。本文是设计依据，不是面向作者的产品文案，也不是实现方案。

## 已核对的行为

| 能力 | 依据 | 设计约束 |
|---|---|---|
| 创建或按标识、路径打开作品 | `v0/src/main.ts`、`v0/src/layout.ts` | 作品位于本机。代码没有现成的浏览器作品选择器 |
| 新建任务、列出登记记录、继续最近任务 | `v0/src/app.ts`、`v0/src/layout.ts` | 运行入口接受最近任务恢复，没有任意历史任务恢复入口 |
| 进程重启后的任务处理 | `v0/src/app.ts` | 原 running/idle 子代理被标为 terminated，保留任务、会话和产物；不能宣称原子代理在重启后自动继续 |
| 作者对话、写作、检查与同步协作 | `v0/src/tools.ts`、`v0/src/session.ts`、`v0/src/hub.ts` | 保留现有角色和工具边界；作者不需要直接向各个子代理分配工作 |
| 四个 Agent 的职责 | `v0/prompts/sp/` 下 context、writer、reviewer、sync_checker 提示词 | Context 是唯一对话入口，负责统筹、资料与方案检查；Writer 写稿，Reviewer 只检查正文，Sync Checker 只核对资料变更 |
| 正文检查与有限返修 | `v0/prompts/skills/write-chapter/SKILL.md` 第 6–9 步 | Context 先核实待核实项，再将确证冲突交写手；每版派新检查员。满足既有停止条件时如实交稿，不能把交稿等同于全部通过。纯措辞修改由 Context 完成后仍须复查 |
| 定稿后的资料同步 | `v0/prompts/skills/context-sync/SKILL.md`、`v0/prompts/sp/sync_checker.md` | Context 整理并应用变化，Sync Checker 对照正文与既有资料核对；不支持项删除或更正重核，冲突由作者决定，下一次派写手前须完成待同步 |
| 章节方案由 Agent 检查并推进 | `v0/prompts/skills/write-chapter/SKILL.md` 第 4 步 | 方案无问题后由 Context 通知写手写正文；只有涉及作者决定时才询问。不能把逐章点击“按这个方案写”当成既有必经步骤 |
| 首次开场与自由讨论 | `v0/prompts/sp/context.md` | 作者可以没有作品内容，不要求先定标题、类型或导入资料；讨论不是自动进入写章的指令 |
| 写作要求与材料、章节方案、初稿、正文检查、同步清单与核对结论 | `v0/src/layout.ts`、`v0/src/schema.ts` | 产物有各自身份与关联。检查不能误关联到另一版初稿 |
| 正式资料查询 | `v0/src/canon.ts`、`v0/src/tools.ts` | 当前资料类型为 chapter、character、library、world_node、outline_node；不把旧 MVP 的全部资料页面视为现成能力 |
| 作者确认后的资料修改 | `v0/src/transcript.ts`、`v0/src/hub.ts` | 写入校验依赖作者最近的真实消息；页面不能凭空合成作者已经同意的事实 |
| 初稿定稿 | `v0/src/hub.ts` 的 finalize、`v0/src/extension.ts` | 可明确指定初稿；保存正文并列入待同步章节，再通知进行资料同步，不是正文与资料的一次原子更新 |
| 停止执行 | `v0/src/hub.ts` 的 stopAll/stopSubagent、现有交互运行时 | Noya stopAll 只停止正在运行的子代理；页面的总停止还需覆盖主 Agent，不能把调用它等同于全部停止 |
| 初稿盲比与偏好记录 | `v0/src/hub.ts` 的 compare/comparePick | 比较当前最新初稿所属 Writer 的首版和最新版；少于两个版本时不可比较。选择不等于定稿 |
| 审计报告 | `v0/src/audit.ts`、`v0/src/main.ts` | 可针对任务产生报告；其中 API 金额是估算，不能当作订阅实际扣费 |
| 现有配置与 ChatGPT 授权 | `README.md`、`v0/src/config.ts`、`v0/src/models.ts`、`.scratch/chatgpt-plan-integration/validation.md` | 可复用本机运行时的授权与配置；浏览器中的登录入口还需要适配 |

## 页面适配与业务能力的区别

作品切换、最近任务恢复、消息显示、内容预览、重连、点击定稿及连接状态属于本轮需要设计并实现的页面能力。现有业务函数与记录提供基础，但本轮源码核对没有证明这些浏览器路径已经存在。当前原型已按认可的旅程收敛，详细对照见 `capability-walkthrough.md`。

“单个活动作者任务”是本轮确认的产品范围，需要页面入口配合约束；不是声称 v0 已经有跨进程的全局并发锁。同一任务内已有的多角色执行继续保留。

任务登记记录没有一套完整的产品任务状态枚举。页面必须结合真实运行情况、消息、子代理状态和产物表达状态，不能把某个子代理空闲直接当作任务已经完成。

## 与旧 MVP PRD 的关系

`docs/prd/noya-mvp/` 保留为过去的产品探索。当前作者已明确要求任务为中心、只读产物、本机使用和按现有能力收口；本包单独记录本轮设计，不覆盖旧稿。旧稿中的正文编辑、完整资料工作台及原子定稿等描述，不直接作为本轮已实现能力。
