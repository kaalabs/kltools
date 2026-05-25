const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

function runNode(args) {
  return execFileSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
}

test("package exposes the mcporter command", () => {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

  assert.equal(pkg.name, "mcporter");
  assert.deepEqual(pkg.bin, { mcporter: "./bin/mcporter.js" });
});

test("built CLI help identifies the local mcporter command", () => {
  const help = runNode(["./dist/index.js", "--help"]);

  assert.match(help, /Usage: mcporter \[options\] \[command\]/);
  assert.match(help, /CLI for MCP servers discovered from OpenCode and Codex configs/);
});

test("local bin wrapper executes the local build", () => {
  const help = runNode(["./bin/mcporter.js", "--help"]);

  assert.match(help, /Usage: mcporter \[options\] \[command\]/);
});

test("built CLI reports the app version", () => {
  const version = runNode(["./dist/index.js", "--version"]).trim();

  assert.equal(version, "1.0.1");
});
