#!/usr/bin/env bash
# Every commit in this repository is authored by its maintainer alone:
# no other authors or committers, and no co-author trailers.
# Usage: scripts/check-authorship.sh [ref]   (default: HEAD)
set -euo pipefail

ref="${1:-HEAD}"
authors='^(suprabhatkumar02@gmail\.com|68507226\+suprabhat02@users\.noreply\.github\.com)$'
# GitHub itself is the committer of merges made in the web UI.
committers='^(suprabhatkumar02@gmail\.com|68507226\+suprabhat02@users\.noreply\.github\.com|noreply@github\.com)$'

status=0
while IFS=$'\t' read -r sha author committer; do
  if ! [[ "$author" =~ $authors ]]; then
    echo "::error::${sha:0:7} is authored by ${author}"
    status=1
  fi
  if ! [[ "$committer" =~ $committers ]]; then
    echo "::error::${sha:0:7} is committed by ${committer}"
    status=1
  fi
  if git log -1 --format=%B "$sha" | grep -qiE '^[[:space:]]*co-authored-by:'; then
    echo "::error::${sha:0:7} has a co-author trailer"
    status=1
  fi
done < <(git log "$ref" --format=$'%H\t%ae\t%ce')

if [ "$status" -eq 0 ]; then
  echo "Authorship OK: $(git rev-list --count "$ref") commits, maintainer only."
fi
exit "$status"
