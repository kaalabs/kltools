import { mkdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

function binName() {
  return process.platform === "win32" ? "mcporter.exe" : "mcporter";
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");
const outBin = path.join(distDir, binName());

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

run("npm", ["run", "build"]);
run("bun", ["build", "--compile", "./dist/index.js", "--outfile", outBin]);

await writeFile(
  path.join(distDir, "README.txt"),
  [
    "mcporter distribution",
    "",
    `Binary: ${binName()}`,
    "",
    process.platform === "win32" ? `Run: .\\${binName()}` : `Run: ./${binName()}`,
    "",
  ].join("\n"),
  "utf8",
);
