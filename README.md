# Noya

Noya 帮助独立作者把一次次创作决定持续写成长篇小说。当前可运行的实现在 `v0/`。

## 启动 v0

需要 Node `>=22.19.0` 和 `rg`（ripgrep）。模型密钥只读环境变量 `DEEPSEEK_API_KEY`。

```bash
cd v0
npm install
export DEEPSEEK_API_KEY=...
npm run noya
```

`npm run noya` 新建作品并进入对话。

```bash
npm run noya -- <作品> --continue   # 继续该作品最近一个任务
npm run noya -- audit <作品>        # 写审计报告
```

`<作品>` 可以是作品 ID，也可以是作品目录路径。

```bash
npm test
npm run typecheck
```
