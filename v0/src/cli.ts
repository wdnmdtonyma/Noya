#!/usr/bin/env node
process.env.PI_OFFLINE = "1";
process.env.PI_SKIP_VERSION_CHECK = "1";

const { main } = await import("./main.ts");

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
