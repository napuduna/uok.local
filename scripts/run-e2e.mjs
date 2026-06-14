import { spawnSync } from "node:child_process";
import process from "node:process";

const corepackCommand =
  process.platform === "win32" ? "corepack.cmd" : "corepack";

function runPnpm(args) {
  const result = spawnSync(corepackCommand, ["pnpm", ...args], {
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

  return result.status ?? 1;
}

const setupStatus = runPnpm([
  "--filter",
  "@warehouse/database",
  "prisma:e2e:setup"
]);

if (setupStatus !== 0) {
  process.exit(setupStatus);
}

let testStatus = 1;

try {
  testStatus = runPnpm(["--filter", "@warehouse/web", "test:e2e"]);
} finally {
  const cleanupStatus = runPnpm([
    "--filter",
    "@warehouse/database",
    "prisma:e2e:cleanup"
  ]);

  if (testStatus === 0 && cleanupStatus !== 0) {
    testStatus = cleanupStatus;
  }
}

process.exit(testStatus);
