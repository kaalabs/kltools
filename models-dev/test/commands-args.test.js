import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {promisify} from "node:util";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const runJs = path.join(projectRoot, "bin", "run.js");
const fixtureApi = path.join(__dirname, "fixtures", "api.json");

async function runCli(args) {
  const {stdout, stderr} = await execFileAsync(process.execPath, [runJs, ...args], {
    env: {...process.env, NO_COLOR: "1"},
  });
  return {stdout, stderr};
}

test("models show parses providerId/modelId", async () => {
  const {stdout} = await runCli([
    "models",
    "show",
    "vercel/openai/gpt-5.2",
    "--api-url",
    fixtureApi,
    "--format",
    "json",
    "--compact",
  ]);

  const data = JSON.parse(stdout);
  assert.equal(data.provider.id, "vercel");
  assert.equal(data.modelId, "openai/gpt-5.2");
  assert.equal(data.ref, "vercel/openai/gpt-5.2");
});

test("providers show parses providerId", async () => {
  const {stdout} = await runCli([
    "providers",
    "show",
    "openai",
    "--api-url",
    fixtureApi,
    "--format",
    "json",
    "--compact",
  ]);

  const data = JSON.parse(stdout);
  assert.equal(data.provider.id, "openai");
  assert.ok(Array.isArray(data.models));
  assert.deepEqual(data.models[0], {id: "gpt-5.2", name: "GPT-5.2", family: "gpt-5"});
});

test("models add parses ref", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "modelsdev-test-"));
  const configPath = path.join(tempDir, "config.toml");
  await fs.writeFile(configPath, "# test\n");

  await runCli([
    "models",
    "add",
    "vercel/openai/gpt-5.2",
    "--api-url",
    fixtureApi,
    "--config",
    configPath,
    "--label",
    "Test Label",
  ]);

  const configText = await fs.readFile(configPath, "utf8");
  assert.match(configText, /^\[providers\.vercel\]/m);
  assert.match(configText, /^id\s*=\s*"openai\/gpt-5\.2"$/m);
});

