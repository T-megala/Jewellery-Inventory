import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const migrateScript = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "database",
  "migrate.js",
);

const child = spawn(process.execPath, [migrateScript], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
