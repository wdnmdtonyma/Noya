# Noya

Noya 帮助独立作者把一次次创作决定持续写成长篇小说。当前可运行的实现在 `v0/`。

## 启动 v0

需要 Node `>=22.19.0` 和 `rg`（ripgrep）。首次安装本地命令：

```bash
cd v0
npm install
npm link
```

之后在任意目录输入 `noya` 即可新建作品并进入对话。它默认加载 `v0/noya.chatgpt.config.json`，四个角色都使用 ChatGPT 订阅、`gpt-6.1-sol`、`thinking=xhigh`：

```bash
noya
```

进入对话后使用 `/login openai`，选择 **Sign in with ChatGPT** 并在浏览器授权。授权界面显示 Pi；登录、安装标识、凭证保存与刷新由 Pi 管理。凭证保存在所选配置的 `worksRoot/.noya/agent/`，四个角色共享它，重启后继续使用。这个目录禁止 Noya 工具访问，也不进入作品 Git。

OpenAI 配置只使用当前运行时的 ChatGPT 订阅授权。`OPENAI_API_KEY`、保存的 API key 和旧 Codex 登录不能补位。模型目录用于配置能力校验，账号能否调用仍以实际请求为准；拒绝、额度错误、未完成响应和断流会报告失败，不自动换模型、thinking 或供应方。

继续同一作品最近的写作任务：

```bash
noya <作品> --continue
```

订阅验收与模拟测试的结果见 [验收记录](.scratch/chatgpt-plan-integration/validation.md)。

```bash
noya audit <作品>                  # 写审计报告
```

`<作品>` 可以是作品 ID，也可以是作品目录路径。

`NOYA_CONFIG` 仍可指定其他配置。比如在 `v0/` 目录下使用 DeepSeek：

```bash
export DEEPSEEK_API_KEY=...
NOYA_CONFIG=./noya.config.json noya
```

原来的 `npm run noya` 入口继续保留，未指定 `NOYA_CONFIG` 时使用 DeepSeek 配置。

```bash
npm test
npm run typecheck
```
