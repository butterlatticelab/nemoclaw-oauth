#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: $0 /path/to/NemoClaw" >&2
  exit 1
fi

upstream_repo="$1"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
manifest_path="$repo_root/patches/manifest.json"
base_commit="$(node -e 'const fs=require("node:fs"); const m=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(String(m.baseCommit || ""));' "$manifest_path")"
tmpdir="$(mktemp -d)"

cleanup() {
  if git -C "$upstream_repo" worktree list --porcelain 2>/dev/null | grep -q "$tmpdir"; then
    git -C "$upstream_repo" worktree remove -f "$tmpdir" >/dev/null 2>&1 || true
  else
    rm -rf "$tmpdir"
  fi
}
trap cleanup EXIT

if [ -z "$base_commit" ]; then
  echo "baseCommit missing from $manifest_path" >&2
  exit 1
fi

if ! git -C "$upstream_repo" cat-file -e "${base_commit}^{commit}" 2>/dev/null; then
  echo "base commit $base_commit is not present in $upstream_repo" >&2
  exit 1
fi

git -C "$upstream_repo" worktree add --detach "$tmpdir" "$base_commit" >/dev/null
node "$repo_root/bin/nemoclaw-oauth.js" check "$tmpdir"
node "$repo_root/bin/nemoclaw-oauth.js" apply "$tmpdir"

if [ -x "$(command -v npm)" ] && [ -f "$tmpdir/package.json" ]; then
  echo "note: patch applied to clean worktree at $tmpdir"
  echo "note: run the validation commands from patches/manifest.json there if dependencies are installed"
fi
