#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: $0 /path/to/upstream-nemoclaw /path/to/patched-nemoclaw" >&2
  exit 1
fi

upstream_repo="$1"
patched_repo="$2"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
manifest_path="$repo_root/patches/manifest.json"
patch_file="$(node -e 'const fs=require("node:fs"); const m=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(String(m.patchFile || ""));' "$manifest_path")"
patch_path="$repo_root/$patch_file"

if [ ! -d "$upstream_repo/.git" ]; then
  echo "upstream repo is not a git checkout: $upstream_repo" >&2
  exit 1
fi

if [ ! -d "$patched_repo/.git" ]; then
  echo "patched repo is not a git checkout: $patched_repo" >&2
  exit 1
fi

if [ -z "$patch_file" ]; then
  echo "patchFile missing from $manifest_path" >&2
  exit 1
fi

mapfile -t included_paths < <(
  node -e 'const fs=require("node:fs"); const m=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); for (const p of m.includedPaths) console.log(p);' \
    "$manifest_path"
)

if [ "${#included_paths[@]}" -eq 0 ]; then
  echo "no included paths found in $manifest_path" >&2
  exit 1
fi

git -C "$patched_repo" diff --full-index --binary -- "${included_paths[@]}" > "$patch_path"
echo "wrote $patch_path"
