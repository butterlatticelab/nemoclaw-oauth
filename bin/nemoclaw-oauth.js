#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function usage() {
  return [
    "usage: nemoclaw-oauth <check|apply|manifest> [path-to-nemoclaw]",
    "",
    "  manifest                  print patch metadata",
    "  check <repo>              verify the patch applies cleanly",
    "  apply <repo>              verify then apply the patch",
  ].join("\n");
}

function fail(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.stdio || "inherit",
    encoding: "utf8",
    ...options,
  });
  if (result.error) {
    fail(result.error.message);
  }
  return result;
}

function loadManifest(repoRoot) {
  const manifestPath = path.join(repoRoot, "patches", "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    fail(`manifest not found: ${manifestPath}`);
  }
  return {
    manifestPath,
    manifest: JSON.parse(fs.readFileSync(manifestPath, "utf8")),
  };
}

function repoRootFromSelf() {
  return path.resolve(__dirname, "..");
}

function patchPathFromManifest(repoRoot, manifest) {
  const patchFile = path.join(repoRoot, manifest.patchFile);
  if (!fs.existsSync(patchFile)) {
    fail(`patch file not found: ${patchFile}`);
  }
  return patchFile;
}

function requireGitCheckout(targetRepo) {
  if (!targetRepo) {
    fail(usage());
  }
  if (!fs.existsSync(path.join(targetRepo, ".git"))) {
    fail(`target is not a git checkout: ${targetRepo}`);
  }
}

function currentHead(targetRepo) {
  const result = run("git", ["-C", targetRepo, "rev-parse", "HEAD"], {
    stdio: "pipe",
  });
  if (result.status !== 0) {
    fail(`failed to resolve HEAD for ${targetRepo}`);
  }
  return String(result.stdout || "").trim();
}

function noteBaseCommit(targetRepo, manifest) {
  const head = currentHead(targetRepo);
  if (head !== manifest.baseCommit) {
    process.stderr.write(
      `note: target HEAD ${head} differs from patch base ${manifest.baseCommit}; proceeding with git apply --3way\n`
    );
  }
}

function cmdManifest(repoRoot) {
  const { manifest } = loadManifest(repoRoot);
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

function cmdCheck(repoRoot, targetRepo) {
  requireGitCheckout(targetRepo);
  const { manifest } = loadManifest(repoRoot);
  noteBaseCommit(targetRepo, manifest);
  const patchFile = patchPathFromManifest(repoRoot, manifest);
  const result = run("git", ["-C", targetRepo, "apply", "--3way", "--check", patchFile], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function cmdApply(repoRoot, targetRepo) {
  requireGitCheckout(targetRepo);
  const { manifest } = loadManifest(repoRoot);
  noteBaseCommit(targetRepo, manifest);
  const patchFile = patchPathFromManifest(repoRoot, manifest);

  process.stdout.write(`patch id: ${manifest.patchId}\n`);
  process.stdout.write(`base commit: ${manifest.baseCommit}\n`);

  const checkResult = run("git", ["-C", targetRepo, "apply", "--3way", "--check", patchFile], {
    stdio: "inherit",
  });
  if (checkResult.status !== 0) {
    process.exit(checkResult.status || 1);
  }

  const applyResult = run("git", ["-C", targetRepo, "apply", "--3way", patchFile], {
    stdio: "inherit",
  });
  if (applyResult.status !== 0) {
    process.exit(applyResult.status || 1);
  }

  process.stdout.write(`applied: ${patchFile}\n`);
}

function main() {
  const repoRoot = repoRootFromSelf();
  const [command, targetRepo] = process.argv.slice(2);

  switch (command) {
    case "--help":
    case "-h":
      process.stdout.write(`${usage()}\n`);
      return;
    case "manifest":
      cmdManifest(repoRoot);
      return;
    case "check":
      cmdCheck(repoRoot, targetRepo);
      return;
    case "apply":
      cmdApply(repoRoot, targetRepo);
      return;
    default:
      fail(usage());
  }
}

main();
