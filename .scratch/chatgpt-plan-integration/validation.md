# ChatGPT 订阅接入验证

日期：2026-10-03。实现范围为本地单账号、单进程，四个角色共享 ModelRuntime。

## 实现与模拟验证

- Pi AI 与 coding-agent 精确锁定 1.0.0，默认 DeepSeek 配置保留。
- OpenAI 配置及未知模型注册按 provider 处理，thinking 不支持时明确报错。
- 复用 Pi OAuth 登录、凭证存储、刷新和持久化安装标识；OpenAI 路径排除环境／保存的 API key 与旧 Codex 凭证。
- 请求仍由 Pi 转换并解析。Noya 只补稳定的 `noya` 工具 namespace、订阅凭证／公开 endpoint 边界，以及 `response.incomplete` 的失败判定。Pi 已实现字段省略、failed、断流与未完成工具的检测。
- 应用层测试经过 openWritingSession 和真实 Noya 工具，验证调用 ID／namespace／结果历史重放，四角色短章、作者定稿、Context 同步、失败轮次保留旧产物和重建运行时后的续写。
- OAuth 模拟经过共享运行时的 login 和外部 token endpoint；验证安装标识与已保存凭证的复用。没有复制 Pi 的 OAuth 协议测试矩阵。
- 模拟结果不代表账号权限、真实浏览器授权、网络刷新或文学质量已经验收。

检查结果：`npm run typecheck` 通过，全量 `npm test` 57/57 通过。随后对界面估算说明的窄幅修复再次运行 typecheck 与会话工厂测试（6/6 通过），并在真实 Pi CLI 中验证。

默认配置四角色仍解析为 `deepseek/deepseek-flash`、`thinking=max`；原有流程 fixture、工具权限、领域门禁及续写回归通过。没有进行真实 DeepSeek 推理调用。

两个独立子代理按 `code-review` 检查 Standards 与 Spec。Standards 0 个发现；Spec 1 个 P2（Pi 界面金额缺少估算说明），已修复并复核，没有剩余可操作发现。界面在 OpenAI 或保存历史含 OpenAI 时持续说明“API 估算金额，非 ChatGPT 订阅扣费”，包括 `/session`。详见 [review.md](review.md)。

## 真实订阅验收

状态：通过，票 03 的真实验收条件已完成。结构化脱敏结果见 [live-result.json](live-result.json)。

首次模型由作者确定为 `gpt-6.1-sol`，四角色 `thinking=low`。使用独立的测试作品，不修改作者已有作品。

实际结果：

- 作者在浏览器完成 Pi 授权。独立运行目录只有一份 `auth.json`；四角色没有创建凭证副本。
- 极小请求返回“Noya 订阅验收就绪。”，保存响应的完成状态为 `completed`。
- Context 保存 Package 并派发原 Writer；Writer 提交 `plan_1`，Context 读取核对后让同一 Writer 提交约 150 字短稿 `draft_1`。正文检查员保存 `review_1`，四项检查均为 passed。
- 作者明确同意定稿后，执行原有 `/finalize draft_1`。同步核对员提交 `check_1`，两项变更有定稿原文依据；Context 应用 `proposal_1`，写入人物 `ahe` 与章节摘要，待同步列表为空。
- 所有角色均实际使用同一模型；保存的完成响应数分别为 Context 43、Writer 8、正文检查员 2、同步核对员 5，模型失败响应为 0。这些数值来自 Pi 保存的 terminal 状态，不包含逐事件原始日志。
- 退出后通过 Pi 的公开 `getAuth` 最小有效期参数触发真实 OAuth 刷新，Pi 保存更新后的凭证。再用原 CLI 的 `--continue` 重启，没有再次登录；新请求实际调用 `query_canon`，读取章节与人物并返回“续写验收完成”，响应为 completed。原任务 `te2f8115a`、工具历史与产物均保留。
- 真实凭证未出现在代码 diff、提示词、作品或审计报告中。测试目录位于被 Git 忽略的 `v0/works/.chatgpt-acceptance/`，保存供作者后续复用。

验收中，Context 首版 Brief 含“本轮仅交方案”的阶段限制；进入正文阶段时按既有 `save_package` → `send_message(package_id)` 流程更新 Brief，随后完成交稿。没有修改 SP／Skills、角色编排或作品 schema。文学质量不属于此次结论。

以下为本轮执行的验收步骤：

1. 在 Noya 的 Pi 交互界面 `/login openai`，选择 Sign in with ChatGPT，由作者在浏览器授权 Pi。
2. 请求仅回复一句短文本，确认响应完成。
3. 准备极小 Writing Package，派发 Writer 先提交方案；Context 检查后让原 Writer 交短初稿。
4. 独立正文检查员检查整章；由作者决定是否用 `/finalize <draft_id>` 定稿。
5. 从定稿正文提出摘要变更，同步核对员确认依据后 Context 应用同步。
6. 退出，用相同配置与 `--continue` 继续该作品，再完成一条请求，确认任务、工具历史与产物保留。

验收记录只保存依赖版本、模型、完成事件、工具／产物与续写结果。不要保存凭证、完整回调 URL 或授权 URL；不要将 API 价格估算当作订阅扣费。

协议依据：

- [订阅 Responses 限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- [模型调用与完成判定](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
