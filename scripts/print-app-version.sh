#!/usr/bin/env bash
# Prints the current app version for VITE_APP_VERSION: the tag pointing at
# HEAD (written by tag-next-version.sh into .next-version when run in the
# same job), falling back to the most recent vYYYY.MM.DD-N tag reachable
# from HEAD, or "dev" if none exists yet.
set -euo pipefail

if [ -f .next-version ]; then
  cat .next-version
  exit 0
fi

tag="$(git tag --points-at HEAD | grep -E '^v[0-9]{4}\.[0-9]{2}\.[0-9]{2}-[0-9]+$' | head -n1 || true)"
if [ -n "$tag" ]; then
  echo "$tag"
  exit 0
fi

tag="$(git describe --tags --match 'v[0-9]*.[0-9]*.[0-9]*-*' --abbrev=0 2>/dev/null || true)"
if [ -n "$tag" ]; then
  echo "$tag"
  exit 0
fi

echo "dev"
