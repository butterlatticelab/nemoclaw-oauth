#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function usage() {
  return [
    "usage: nemoclaw-oauth <check|apply|reverse|revert|manifest> [path-to-nemoclaw]",
    "",
    "  manifest                  print patch metadata",
    "  check <repo>              verify the patch applies cleanly",
    "  apply <repo>              verify then apply the patch",
    "  reverse <repo>            reverse the applied patch",
    "  revert <repo>             alias for reverse",
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
  if (result.error && result.status == null && result.signal == null) {
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
  const resolvedRepo = path.resolve(targetRepo);
  if (!fs.existsSync(path.join(resolvedRepo, ".git"))) {
    fail(`target is not a git checkout: ${resolvedRepo}`);
  }
  return resolvedRepo;
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

function hasCommit(targetRepo, commit) {
  const result = run("git", ["-C", targetRepo, "cat-file", "-e", `${commit}^{commit}`], {
    stdio: "ignore",
  });
  return result.status === 0;
}

function currentWorktreeStatus(targetRepo) {
  const result = run("git", ["-C", targetRepo, "status", "--porcelain"], {
    stdio: "pipe",
  });
  if (result.status !== 0) {
    fail(`failed to inspect worktree status for ${targetRepo}`);
  }
  return String(result.stdout || "").trim();
}

function warnIfDirtyWorktree(targetRepo) {
  if (!currentWorktreeStatus(targetRepo)) {
    return;
  }
  process.stderr.write(
    `warning: target worktree ${targetRepo} is not clean; patch application may conflict with local changes or untracked files\n`
  );
  process.stderr.write("warning: use a clean branch or disposable worktree when possible\n");
}

function noteBaseCommit(targetRepo, manifest) {
  if (!hasCommit(targetRepo, manifest.baseCommit)) {
    process.stderr.write(
      `note: patch base commit ${manifest.baseCommit} is not present in ${targetRepo}; git apply --3way will be best-effort\n`
    );
    return;
  }
  const head = currentHead(targetRepo);
  if (head !== manifest.baseCommit) {
    process.stderr.write(
      `note: target HEAD ${head} differs from patch base ${manifest.baseCommit}; proceeding with git apply --3way\n`
    );
  }
}

function gitApplyCheck(targetRepo, patchFile, options = {}) {
  const args = ["-C", targetRepo, "apply"];
  if (options.reverse) {
    args.push("--reverse");
  }
  args.push("--check", patchFile);
  return run("git", args, {
    stdio: options.stdio || "pipe",
  });
}

function gitApply(targetRepo, patchFile, options = {}) {
  const args = ["-C", targetRepo, "apply", "--3way"];
  if (options.reverse) {
    args.push("--reverse");
  }
  args.push(patchFile);
  return run("git", args, {
    stdio: options.stdio || "pipe",
  });
}

function gitOutput(result) {
  return String(result.stdout || "") + String(result.stderr || "");
}

function classifyPatchState(targetRepo, patchFile) {
  const forwardCheck = gitApplyCheck(targetRepo, patchFile, {
    stdio: "pipe",
  });
  const reverseCheck = gitApplyCheck(targetRepo, patchFile, {
    reverse: true,
    stdio: "pipe",
  });

  return {
    forwardCheck,
    reverseCheck,
  };
}

function failForForwardState(targetRepo, patchFile, state) {
  if (state.reverseCheck.status === 0) {
    fail(
      [
        `patch appears to already be applied in ${targetRepo}`,
        `use "nemoclaw-oauth reverse ${targetRepo}" to roll it back`,
      ].join("\n")
    );
  }

  if (state.forwardCheck.status === 0) {
    return;
  }

  const output = gitOutput(state.forwardCheck).trim();
  fail(
    [
      `patch is incompatible with ${targetRepo}`,
      output ? output : "git apply --3way --check did not apply cleanly",
      `patch file: ${patchFile}`,
    ].join("\n")
  );
}

function failForReverseState(targetRepo, patchFile, state) {
  if (state.reverseCheck.status === 0) {
    return;
  }

  if (state.forwardCheck.status === 0) {
    fail(
      [
        `patch does not appear to be applied in ${targetRepo}`,
        `use "nemoclaw-oauth apply ${targetRepo}" to apply it`,
      ].join("\n")
    );
  }

  const output = gitOutput(state.reverseCheck).trim();
  fail(
    [
      `patch cannot be reversed cleanly from ${targetRepo}`,
      output ? output : "git apply --3way --reverse --check did not apply cleanly",
      `patch file: ${patchFile}`,
    ].join("\n")
  );
}

function cmdManifest(repoRoot) {
  const { manifest } = loadManifest(repoRoot);
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

function cmdCheck(repoRoot, targetRepo) {
  const resolvedRepo = requireGitCheckout(targetRepo);
  const { manifest } = loadManifest(repoRoot);
  noteBaseCommit(resolvedRepo, manifest);
  const patchFile = patchPathFromManifest(repoRoot, manifest);
  const state = classifyPatchState(resolvedRepo, patchFile);
  failForForwardState(resolvedRepo, patchFile, state);
  process.stdout.write(`patch applies cleanly to ${resolvedRepo}\n`);
}

function cmdApply(repoRoot, targetRepo) {
  const resolvedRepo = requireGitCheckout(targetRepo);
  const { manifest } = loadManifest(repoRoot);
  noteBaseCommit(resolvedRepo, manifest);
  const patchFile = patchPathFromManifest(repoRoot, manifest);
  warnIfDirtyWorktree(resolvedRepo);

  process.stdout.write(`patch id: ${manifest.patchId}\n`);
  process.stdout.write(`base commit: ${manifest.baseCommit}\n`);

  const state = classifyPatchState(resolvedRepo, patchFile);
  failForForwardState(resolvedRepo, patchFile, state);

  const applyResult = gitApply(resolvedRepo, patchFile, {
    stdio: "inherit",
  });
  if (applyResult.status !== 0) {
    process.exit(applyResult.status || 1);
  }

  process.stdout.write(`applied: ${patchFile}\n`);
}

function cmdReverse(repoRoot, targetRepo) {
  const resolvedRepo = requireGitCheckout(targetRepo);
  const { manifest } = loadManifest(repoRoot);
  noteBaseCommit(resolvedRepo, manifest);
  const patchFile = patchPathFromManifest(repoRoot, manifest);
  warnIfDirtyWorktree(resolvedRepo);

  process.stdout.write(`patch id: ${manifest.patchId}\n`);
  process.stdout.write(`base commit: ${manifest.baseCommit}\n`);

  const state = classifyPatchState(resolvedRepo, patchFile);
  failForReverseState(resolvedRepo, patchFile, state);

  const reverseResult = gitApply(resolvedRepo, patchFile, {
    reverse: true,
    stdio: "inherit",
  });
  if (reverseResult.status !== 0) {
    process.exit(reverseResult.status || 1);
  }

  process.stdout.write(`reversed: ${patchFile}\n`);
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
    case "reverse":
    case "revert":
      cmdReverse(repoRoot, targetRepo);
      return;
    default:
      fail(usage());
  }
}

main();
