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

最终检查结果和评审结论在完成后补充。

## 真实订阅验收

状态：待作者浏览器授权及真实调用，票 03 尚未交付。

首次模型由作者确定为 `gpt-6.1-sol`，四角色 `thinking=low`。使用独立的测试作品，不修改作者已有作品。

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
