import { join } from "node:path";
import { initTheme, InteractiveMode } from "@earendil-works/pi-coding-agent";
import { openWritingSession } from "./app.ts";
import { writeAudit } from "./audit.ts";
import { loadConfig } from "./config.ts";
import { createWork, resolveWork } from "./layout.ts";
import { resolveRoleModels } from "./models.ts";
import { commandExists } from "./util.ts";

export async function main(argv: string[]): Promise<void> {
  const config = loadConfig();
  if (argv[0] === "audit") {
    if (!commandExists("rg")) {
      console.error("需要 rg（ripgrep）才能启动 Noya。");
      process.exit(1);
    }
    const workRef = argv[1];
    if (!workRef) {
      console.error("用法：noya audit <作品> [任务]");
      process.exit(1);
    }
    const output = await writeAudit(config, workRef, argv[2]);
    console.log(output);
    return;
  }
  if (!commandExists("rg")) {
    console.error("需要 rg（ripgrep）才能启动 Noya。");
    process.exit(1);
  }
  const resume = argv.includes("--continue");
  const workRef = argv.find((arg) => arg !== "--continue");
  if (resume && !workRef) {
    console.error("用法：noya <作品> --continue");
    process.exit(1);
  }
  const agentDir = join(config.worksRoot, ".noya", "agent");
  const { runtime, models } = await resolveRoleModels(config, agentDir);
  const work = workRef ? resolveWork(config.worksRoot, agentDir, workRef) : await createWork(config.worksRoot, agentDir);
  const opened = await openWritingSession({ work, config, runtime, models, resume });
  initTheme(undefined, false);
  const interactive = new InteractiveMode(opened.runtimeHost, {});
  await interactive.run();
}
