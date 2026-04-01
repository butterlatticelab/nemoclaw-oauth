# `nemoclaw-oauth`

Portable, npm-ready patch package repo for NemoClaw auth-parity work.

This repo is structured so the checked-in patch can be applied directly to future NemoClaw checkouts today and later shipped as a small npm CLI package.

The canonical patch currently ships the **validated NemoClaw source delta** that was applied locally to add **OpenAI Codex OAuth** support while preserving the existing upstream OpenAI and Anthropic provider paths already present in NemoClaw.

Why this is a patch package instead of an OpenClaw plugin:

- the missing behavior lives inside NemoClaw itself
- the working fix changes NemoClaw onboarding, sandbox auth sync, image wiring, and status rendering
- an OpenClaw provider plugin alone would not recreate that behavior

## Current auth scope

- OpenAI API key: existing NemoClaw path, unchanged
- OpenAI Codex OAuth: added by the patch in this repo
- Anthropic API key: existing NemoClaw path, unchanged

This repo targets OpenClaw auth parity for OpenAI and Anthropic, but the checked-in patch only contains the validated local NemoClaw delta. It does **not** invent a new Anthropic browser OAuth flow.

## Repo layout

- `patches/0001-openai-codex-oauth.patch`: canonical patch artifact
- `patches/manifest.json`: patch metadata, included paths, validation commands
- `bin/nemoclaw-oauth.js`: CLI for `check`, `apply`, and `manifest`
- `apply.sh`: convenience wrapper around the CLI
- `scripts/verify-apply.sh`: apply-check helper against a clean worktree
- `scripts/regenerate-patch.sh`: rebuild the patch from a patched NemoClaw checkout

## Usage

Check whether the patch applies:

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

Print patch metadata:

```bash
node ./bin/nemoclaw-oauth.js manifest
```

Later npm usage, once you publish it, is expected to look like:

```bash
npx nemoclaw-oauth apply /path/to/NemoClaw
```

## Validation

Dry-run package contents:

```bash
npm pack --dry-run
```

Check the patch against a clean worktree created from an existing NemoClaw checkout:

```bash
./scripts/verify-apply.sh /path/to/NemoClaw
```

## npm intent

This repo is structured from the start for later npm deployment as a small CLI package that applies the checked-in NemoClaw patch.

Nothing in this repo commits or pushes on your behalf.
