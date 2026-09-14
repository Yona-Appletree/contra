#!/usr/bin/env bash
# Tags HEAD with the next date-based version: vYYYY.MM.DD-N, where the date
# is today in America/Los_Angeles and N is one more than the highest N
# already tagged for that date. Refuses if HEAD is already tagged.
set -euo pipefail

if [ "${CI:-}" = "true" ]; then
  git config user.name "github-actions[bot]"
  git config user.email "github-actions[bot]@users.noreply.github.com"
fi

git fetch --tags --quiet origin || true

existing_tag="$(git tag --points-at HEAD | grep -E '^v[0-9]{4}\.[0-9]{2}\.[0-9]{2}-[0-9]+$' || true)"
if [ -n "$existing_tag" ]; then
  echo "tag-next-version: HEAD is already tagged ($existing_tag); refusing to tag again." >&2
  exit 1
fi

date_part="$(TZ=America/Los_Angeles date +%Y.%m.%d)"

highest_n=0
while IFS= read -r tag; do
  [ -z "$tag" ] && continue
  n="${tag##*-}"
  if [ "$n" -gt "$highest_n" ]; then
    highest_n="$n"
  fi
done < <(git tag --list "v${date_part}-*")

next_n=$((highest_n + 1))
version="v${date_part}-${next_n}"

echo "tag-next-version: tagging HEAD as ${version}"
git tag -a "$version" -m "$version"
git push origin "$version"

echo "$version" > .next-version
echo "version=${version}" >> "${GITHUB_OUTPUT:-/dev/stdout}"
