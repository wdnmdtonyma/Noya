import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { AppError, type LocalApp } from "./local-app.ts";

export async function startLocalServer(app: LocalApp, options: { port?: number } = {}) {
  const assets = new Map([
    ["/", ["../ui/index.html", "text/html; charset=utf-8"]],
    ["/app.css", ["../ui/app.css", "text/css"]],
    ["/tokens.css", ["../ui/tokens.css", "text/css"]],
    ["/app.js", ["../dist/ui/app.js", "text/javascript"]],
    ["/feed.js", ["../dist/ui/feed.js", "text/javascript"]],
    ["/markup.js", ["../dist/ui/markup.js", "text/javascript"]],
  ]);
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
    try {
      const host = `127.0.0.1:${(server.address() as { port: number }).port}`;
      if (req.headers.host !== host && req.headers.host !== host.replace("127.0.0.1", "localhost")) throw new AppError(403, "只允许本机访问");
      const url = new URL(req.url ?? "/", `http://${host}`);
      if (req.headers.origin && ![`http://${host}`, `http://${host.replace("127.0.0.1", "localhost")}`].includes(req.headers.origin)) throw new AppError(403, "请求来自其他页面，请从本机地址打开 Noya");
      if (req.method === "POST") {
        if (req.headers["content-type"] !== "application/json") throw new AppError(415, "请求必须使用 JSON");
        let body = "";
        for await (const chunk of req) { body += String(chunk); if (body.length > 100_000) throw new AppError(413, "输入过长"); }
        let data;
        try { data = JSON.parse(body); } catch { throw new AppError(400, "请求不是有效 JSON"); }
        if (url.pathname === "/api/works") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(await app.create())); return; }
        if (url.pathname === "/api/tasks") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(await app.createTask(data.workId, data.requestId))); return; }
        if (url.pathname === "/api/command") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(await app.command(data))); return; }
      }
      if (req.method === "GET" && url.pathname === "/api/state") {
        res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(await app.snapshot(url.searchParams.get("work") ?? undefined, url.searchParams.get("task") ?? undefined))); return;
      }
      if (req.method === "GET" && url.pathname === "/api/artifact") {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(await app.artifact({ workId: url.searchParams.get("work") ?? "", taskId: url.searchParams.get("task") ?? "" }, url.searchParams.get("id") ?? ""))); return;
      }
      if (req.method === "GET" && url.pathname === "/api/draft") {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(await app.draft({ workId: url.searchParams.get("work") ?? "", taskId: url.searchParams.get("task") ?? "" }, url.searchParams.get("draft") ?? ""))); return;
      }
      if (req.method === "GET" && url.pathname === "/favicon.ico") { res.writeHead(204); res.end(); return; }
      const asset = assets.get(url.pathname);
      if (req.method !== "GET" || !asset) throw new AppError(404, "找不到此页面或操作");
      res.setHeader("Content-Type", asset[1]!);
      res.end(await readFile(fileURLToPath(new URL(asset[0]!, import.meta.url))));
    } catch (error) {
      res.writeHead(error instanceof AppError ? error.status : 500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : "本机服务处理失败" }));
    }
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(options.port ?? 4317, "127.0.0.1", resolve); });
  return { url: `http://127.0.0.1:${(server.address() as { port: number }).port}`, close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await app.close(); } };
}
