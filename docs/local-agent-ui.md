# 本机写作空间

在 `v0/` 目录执行：

```sh
npm ci
npm run build
npm start
```

打开终端打印的本机地址，默认是 `http://127.0.0.1:4317`。开发时可用 `npm run dev`（构建页面并监听服务端变更）；修改 `ui/` 后执行 `npm run build` 并刷新。`NOYA_PORT` 可覆盖端口。服务只监听 IPv4 回环地址，同源页面与 API 由同一个进程提供。

页面默认使用 `noya.chatgpt.config.json`，沿用其中四个角色的模型与 thinking，不自动更换供应方或计费方式。可通过 `NOYA_CONFIG` 指定其他现有配置。未登录时保留作品和记录，在终端用相同配置启动现有 CLI，执行 `/login openai` 后再发送。原 `noya`、`npm run noya` 和 CLI 参数继续可用。

第一次进入可以直接创建作品，不必填写设定表。选择作品后进入最近任务；正文从对应消息打开，可引用所读版本提出修改，也可明确将这一版定稿。正式资料的具体变化需要作者确认。正文定稿与资料同步分别显示，资料待同步时可继续处理。

一个服务同时执行一个作者任务。执行中可以切换作品和阅读稿件，其他作品的输入会保留。停止需要等待主 Agent、子 Agent 及其通知实际结束。关闭浏览器不停止服务；服务重启会说明中断，原子 Agent 不会被伪装成仍在执行。启动时只尝试继续上次执行中断的资料同步；等待作者决定和主动停止的任务不会自动恢复。

## 组织与边界

- 页面：原生 TypeScript + CSS，复用已确认原型的视觉变量。`tsc -p tsconfig.ui.json` 输出浏览器模块，不引入前端框架、CDN 或运行时依赖。正文和模型文本始终作为文本渲染。
- `LocalApp`：作品身份、单任务占用、页面命令、版本读取、确认和生命周期。执行复用共享 `ModelRuntime`、`openWritingSession`、`TaskHub` 和现有工具、Skills。
- `local-server.ts`：同源 HTTP，固定静态资源表，Host/Origin/JSON 校验；浏览器不能提供任意文件路径。配置与凭证不进入响应。
- 页面以 650ms 间隔读取实际快照，隐藏标签页降频。快照带作品、任务和消息身份；切换时丢弃过期响应，消息节点按身份更新，不重置输入、阅读位置或正在查看的旧版。没有模型演示计时器。
- 作品、正式内容和 Agent 会话沿用 v0 的存储。每个任务的 `page.json` 只补充页面接受的作者输入、请求去重、具体决定和执行状态；浏览器仅保存作品选择、未发送输入与阅读偏好。页面状态损坏会指出受影响对象，不创建替代作品。

## 通信约定

| 路径 | 用途 |
| --- | --- |
| `GET /api/state?work=<workId>` | 作品列表、指定作品最近任务和服务当前占用；不发起模型调用 |
| `POST /api/works` | 新建独立作品与首个空白任务 |
| `GET /api/draft?work=…&task=…&draft=…` | 校验身份后读取完整版本、检查结果与定稿指纹 |
| `POST /api/command` | `message`、`decide`、`finalize`、`continue`、`stop`；必须包含作品、任务和请求 ID |

变更请求使用 `Content-Type: application/json`。失败返回对应 HTTP 状态与 `{ error }`。接受请求与执行完成分开：页面查询后续实际状态，断线不自动重发。定稿还要求明确稿件、所读状态指纹和作者确认；过期指纹不能替换当前正文。同一请求 ID 不会重复启动或重复定稿。

## 验证

```sh
npm run typecheck
node --test test/local-app.test.ts
npm test
```

应用测试只替换共享模型响应，使用真实会话、角色工具、作品存储和服务边界。浏览器与真实模型验收分开记录在 `.scratch/local-agent-ui/validation.md`。

可选的真实模型验收服务：

```sh
node --disable-warning=ExperimentalWarning test/manual-live.ts
```

它使用现有配置与凭证，但将所有验收作品放在新临时目录，并打印该目录与地址。需要重启继续同一验收时，用 `NOYA_ACCEPTANCE_ROOT=<该目录>`；默认验收端口为 4320。此脚本不会进入 `npm test`，也不会自动发起模型请求，除非恢复此前中断的资料同步。
