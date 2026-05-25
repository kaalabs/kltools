const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const repoRoot = path.resolve(root, "..");

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("package exposes a dist build command", () => {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

  assert.equal(pkg.scripts["dist:build"], "node scripts/build-dist.mjs");
});

test("POSIX installer downloads mcporter release assets from kltools", () => {
  const scriptPath = path.join(root, "install.sh");

  assert.equal(existsSync(scriptPath), true);

  const script = readFileSync(scriptPath, "utf8");
  assert.match(script, /REPO="kaalabs\/kltools"/);
  assert.match(script, /mcporter-latest-darwin-arm64\.tar\.gz/);
  assert.match(script, /mcporter-latest-linux-x86_64\.tar\.gz/);
  assert.match(script, /INSTALL_DIR="\$\{INSTALL_DIR:-\$DEFAULT_INSTALL_DIR\}"/);
  assert.match(script, /LAUNCHER="\$BIN_DIR\/mcporter"/);
});

test("PowerShell installer downloads Windows mcporter release assets", () => {
  const scriptPath = path.join(root, "install.ps1");

  assert.equal(existsSync(scriptPath), true);

  const script = readFileSync(scriptPath, "utf8");
  assert.match(script, /\[string\]\$Repo = 'kaalabs\/kltools'/);
  assert.match(script, /mcporter-latest-windows-amd64\.zip/);
  assert.match(script, /Join-Path \$InstallDir 'bin'/);
  assert.match(script, /mcporter\.cmd/);
});

test("release workflow builds package-scoped mcporter assets", () => {
  const workflow = read(".github/workflows/mcporter-release-binaries.yml");

  assert.match(workflow, /tags:\s*\n\s+- "mcporter-v\*"/);
  assert.match(workflow, /working-directory: mcporter/);
  assert.match(workflow, /npm run dist:build/);
  assert.match(workflow, /ASSET_VERSIONED="\$\{REF_NAME\}-\$\{OS\}-\$\{ARCH\}\.tar\.gz"/);
  assert.match(workflow, /mcporter-latest-windows-\$arch\.zip/);
});
