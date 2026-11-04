import { spawnSync } from "node:child_process";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const repository = resolve(appRoot, "..");
const versionPath = "toy-svelte-kit/src/lib/assets/data/app/version.json";
const versionFile = resolve(repository, versionPath);

function git(args) {
  return spawnSync("git", args, {
    cwd: repository,
    encoding: "utf8",
    windowsHide: true
  });
}

function requireGit(args) {
  const result = git(args);
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || result.stderr.trim() || "Git command failed.");
  }
  return result.stdout.trim();
}

function units(version) {
  if (!/^(0|[1-9]\d*)\.\d{2}$/.test(version)) {
    throw new Error("Version must have two decimal places, for example 1.02.");
  }
  return BigInt(version.replace(".", ""));
}

function readVersion() {
  const { version } = JSON.parse(readFileSync(versionFile, "utf8"));
  return units(version);
}

function formatVersion(value) {
  return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}

function writeVersion(value) {
  writeFileSync(versionFile, JSON.stringify({ version: formatVersion(value) }, null, 2) + "\n", "utf8");
}

function install() {
  if (process.env.CI || process.env.VERCEL) return;
  const repositoryCheck = git(["rev-parse", "--show-toplevel"]);
  if (repositoryCheck.error || repositoryCheck.status !== 0) return;
  const configured = git(["config", "--get", "core.hooksPath"]).stdout.trim();
  if (configured && configured !== ".githooks") {
    throw new Error("An existing core.hooksPath is configured: " + configured);
  }
  for (const hook of ["pre-commit", "commit-msg"]) {
    chmodSync(resolve(repository, ".githooks", hook), 0o755);
  }
  requireGit(["config", "--local", "core.hooksPath", ".githooks"]);
  process.stdout.write("Version hooks installed.\n");
}

function prepareCommit() {
  let next = readVersion();
  const previous = git(["show", "HEAD:" + versionPath]);
  if (previous.status === 0) {
    const committed = units(JSON.parse(previous.stdout).version);
    if (next <= committed) next = committed + 1n;
  } else {
    if (previous.error) throw previous.error;
    const tree = git(["ls-tree", "HEAD", "--", versionPath]);
    if (tree.status === 0 && tree.stdout.trim()) {
      throw new Error("Cannot read the committed version file.");
    }
  }
  writeVersion(next);
  requireGit(["add", "--", versionPath]);
  process.stdout.write("Version " + formatVersion(next) + "\n");
}

function stampMessage(path) {
  if (!path) throw new Error("The commit message file is required.");
  const staged = requireGit(["show", ":" + versionPath]);
  const version = formatVersion(units(JSON.parse(staged).version));
  const message = readFileSync(path, "utf8");
  const lines = message.split("\n");
  lines[0] = `[v${version}] ` + lines[0].replace(/^\[v\d+\.\d{2}\]\s*/, "");
  writeFileSync(path, lines.join("\n"), "utf8");
}

try {
  const command = process.argv[2];
  if (command === "install") install();
  else if (command === "commit") prepareCommit();
  else if (command === "message") stampMessage(process.argv[3]);
  else if (command === "major") {
    const next = readVersion() + 100n;
    writeVersion(next);
    process.stdout.write("Version " + formatVersion(next) + "\n");
  } else {
    throw new Error("Usage: node scripts/version.mjs install|commit|message <file>|major");
  }
} catch (error) {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
  process.exitCode = 1;
}
