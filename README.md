# `nemoclaw-oauth`

`@phflot/nemoclaw-oauth` is a small patch-distribution package for [NVIDIA/NemoClaw](https://github.com/NVIDIA/NemoClaw). It ships a checked-in patch and a minimal CLI that verifies, applies, and reverses that patch against a local NemoClaw checkout.

The current patch fills the stock NemoClaw OpenAI Codex OAuth integration gap and restores the older Anthropic Claude CLI credential-reuse path inside NemoClaw, while preserving the existing upstream OpenAI API key and Anthropic API key paths.

## Upstream context

Current OpenClaw upstream already supports OpenAI Codex OAuth on the host side, including `openclaw onboard --auth-choice openai-codex` and `openclaw models auth login --provider openai-codex`.

For Anthropic, current OpenClaw upstream supports API keys, setup-token auth, and a Claude CLI backend migration path on the host side. It does not ship the older direct Claude CLI credential-reuse flow as the supported default sandbox path.

The gap this repository addresses is narrower and more specific: stock NemoClaw does not provide a documented, end-to-end path from `nemoclaw onboard` to a working Codex-OAuth-backed NemoClaw sandbox, and it does not restore the older Anthropic Claude CLI credential-reuse path inside the sandbox. This patch integrates the Codex OAuth flow into NemoClaw and reintroduces the direct Claude CLI credential reuse path for Anthropic-backed NemoClaw sandboxes.

## What this package does

The checked-in patch updates NemoClaw itself to:

- add `openai-codex` as a supported onboarding and inference option
- add `anthropic-claude-cli-oauth` as a supported onboarding and inference option
- configure the sandbox model metadata for ChatGPT OAuth-backed Codex models
- configure direct Anthropic model access for Claude CLI OAuth-backed models
- sync OpenClaw OAuth credentials from the host into the sandbox from the primary `auth-profiles.json` store
- read reusable Claude CLI credentials from the host (`~/.claude/.credentials.json` or macOS keychain), normalize them into OpenClaw auth files, and sync them into the sandbox
- carry forward legacy `~/.openclaw/credentials/oauth.json` compatibility data when present
- add the sandbox `credentials` path required for compatibility OAuth state
- update NemoClaw status and provider-registration behavior for the OAuth-backed path
- include tests covering the new provider mapping and auth-sync behavior

## Why this is distributed as a patch package

This repository distributes a source patch for NemoClaw itself. The change set modifies NemoClaw source files, Dockerfiles, onboarding flow, sandbox auth synchronization, and tests, so the correct delivery format is a patch against NemoClaw rather than an installable OpenClaw plugin.

## Supported auth behavior

- OpenAI API key: upstream NemoClaw behavior, unchanged
- OpenAI Codex OAuth: added by the patch in this repository
- Anthropic API key: upstream NemoClaw behavior, unchanged
- Anthropic Claude CLI OAuth reuse: restored by the patch in this repository

This repository does not add a new Anthropic browser OAuth flow or replace OpenClaw's current setup-token / Claude CLI backend guidance. The Anthropic change here is specifically the restored direct Claude CLI credential-reuse path inside NemoClaw.

OpenClaw's primary auth store is `auth-profiles.json`. The extra `oauth.json` handling in this patch is compatibility support for legacy OpenClaw OAuth import state, not the primary credential source. The Anthropic Claude CLI path is sourced from the local Claude CLI credential store and normalized into `auth-profiles.json` plus `auth.json` before sandbox sync.

## Prerequisites

Before applying the patch, make sure you have:

- Node.js `>=18`
- `git`
- a local NemoClaw git checkout
- a checkout that contains, or is reasonably close to, base commit `f59f58e706ae4121c2f5b3b3b398a844236a50d1`
- if you want Anthropic Claude CLI OAuth reuse, Claude CLI installed on the host and available on `PATH`

Applying the patch on a clean branch or disposable worktree is strongly recommended.

## Quick start

Check whether the patch applies cleanly:

```bash
node ./bin/nemoclaw-oauth.js check /path/to/NemoClaw
```

Apply the patch:

```bash
node ./bin/nemoclaw-oauth.js apply /path/to/NemoClaw
```

Convenience wrapper:

```bash
./apply.sh /path/to/NemoClaw
```

Print the patch metadata:

```bash
node ./bin/nemoclaw-oauth.js manifest
```

Expected npm usage after publishing:

```bash
npx @phflot/nemoclaw-oauth apply /path/to/NemoClaw
```

Reverse the patch:

```bash
node ./bin/nemoclaw-oauth.js reverse /path/to/NemoClaw
```

Alias:

```bash
node ./bin/nemoclaw-oauth.js revert /path/to/NemoClaw
```

If you choose the Anthropic Claude CLI OAuth reuse path and no reusable Claude CLI credential is present yet, onboarding will launch `claude auth login` on the host and then sync the resulting credential into the sandbox.

## Validation

Dry-run the npm package contents:

```bash
npm pack --dry-run
```

Verify that the patch applies against a clean worktree created from the manifest base commit:

```bash
./scripts/verify-apply.sh /path/to/NemoClaw
```

After applying the patch to NemoClaw, run the validation commands listed in `patches/manifest.json` from the patched NemoClaw checkout:

```bash
npm test -- test/inference-config.test.js test/onboard.test.js nemoclaw/src/onboard/config.test.ts nemoclaw/src/commands/slash.test.ts nemoclaw/src/register.test.ts
npm run typecheck:cli
```

Applying the patch is only the first step. The target checkout should still pass its relevant tests and type checks.

## Rollback and failure modes

Rollback the patch from a checkout where it has already been applied:

```bash
node ./bin/nemoclaw-oauth.js reverse /path/to/NemoClaw
```

The CLI warns when the target worktree is dirty before `apply` or `reverse`. It does not block execution, but patching a clean branch or disposable worktree is still the safest workflow.

Common outcomes:

- `apply` reports that the patch already appears to be applied: use `reverse` or `revert` instead of reapplying it
- `reverse` reports that the patch does not appear to be applied: use `apply` first
- the CLI reports an incompatible checkout: the target revision has drifted too far for `git apply --3way` to reconcile automatically
- the CLI reports that the base commit is missing from local history: the patch may still apply, but 3-way merge assistance will be best-effort only

## Compatibility

The checked-in patch is validated against:

- target repository: `https://github.com/NVIDIA/NemoClaw.git`
- base commit: `f59f58e706ae4121c2f5b3b3b398a844236a50d1`

The CLI uses `git apply --3way` for `check`, `apply`, and `reverse`. That makes it more tolerant of nearby upstream changes, but successful application is not guaranteed on arbitrarily newer NemoClaw revisions.

## Repository contents

- `patches/0001-openai-codex-oauth.patch`: canonical patch artifact
- `patches/manifest.json`: patch metadata, target revision, included paths, and validation commands
- `bin/nemoclaw-oauth.js`: CLI for `check`, `apply`, `reverse`, `revert`, and `manifest`
- `apply.sh`: convenience wrapper around the CLI
- `scripts/verify-apply.sh`: verify forward apply and rollback against a clean worktree
- `scripts/regenerate-patch.sh`: rebuild the patch from a patched NemoClaw checkout

## Maintainer workflow

Rebuild the patch from an upstream checkout and a patched checkout:

```bash
./scripts/regenerate-patch.sh /path/to/upstream-nemoclaw /path/to/patched-nemoclaw
```

Verify that the patch still applies from the recorded base commit:

```bash
./scripts/verify-apply.sh /path/to/NemoClaw
```

Nothing in this repository commits or pushes on your behalf.
