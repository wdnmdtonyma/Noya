#!/usr/bin/env -S node --disable-warning=ExperimentalWarning
import { fileURLToPath } from "node:url";

if (!process.env.NOYA_CONFIG) {
  process.env.NOYA_CONFIG = fileURLToPath(new URL("../noya.chatgpt.config.json", import.meta.url));
}

await import("../src/cli.ts");
