import { spawnSync } from "node:child_process";
import process from "node:process";

const corepackCommand =
  process.platform === "win32" ? "corepack.cmd" : "corepack";
const result = spawnSync(corepackCommand, ["pnpm", ...process.argv.slice(2)], {
  env: {
    ...process.env,
    NODE_ENV: "test"
  },
  shell: process.platform === "win32",
  stdio: "inherit"
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
