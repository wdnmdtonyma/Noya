#!/usr/bin/env node
process.env.PI_OFFLINE = "1";
process.env.PI_SKIP_VERSION_CHECK = "1";
const { fileURLToPath } = await import("node:url");
const { loadConfig } = await import("./config.ts");
const { LocalApp } = await import("./local-app.ts");
const { startLocalServer } = await import("./local-server.ts");
try {
  let app: InstanceType<typeof LocalApp>;
  try { app = new LocalApp({ config: loadConfig(process.env.NOYA_CONFIG || fileURLToPath(new URL("../noya.chatgpt.config.json", import.meta.url))) }); }
  catch (error) { app = new LocalApp({ configurationError: `配置无法读取：${error instanceof Error ? error.message : String(error)}。请检查 NOYA_CONFIG 后重启服务。` }); }
  const port = Number(process.env.NOYA_PORT || 4317);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("NOYA_PORT 必须是有效端口");
  const server = await startLocalServer(app, { port });
  console.log(`Noya 本机写作空间：${server.url}`);
  void app.recover();
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { void server.close().then(() => process.exit(0)); });
} catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
