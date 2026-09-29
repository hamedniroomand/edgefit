#!/usr/bin/env bash
# Finds the commit the head is compared with, and writes `has-base`, `sha` and `cache-key` to
# $GITHUB_OUTPUT. Without a base it also writes an empty base report, so every finding counts as new.
# Environment: EVENT, PR_BASE_SHA, PUSH_BEFORE, RUNNER_TEMP, GITHUB_OUTPUT, IDENTITY (the installed
# edgefit, from install.sh) and CACHE_INPUTS (the inputs that change a report).
set -euo pipefail

mkdir -p "$RUNNER_TEMP/edgefit"
fetch=(--no-tags --quiet)
if [ "$(git rev-parse --is-shallow-repository)" = true ]; then
  fetch+=(--unshallow)
fi
# What the head is compared with: a pull request's merge base, or the commit before a push.
# Other events, and a push that creates a branch or rewrites history, have no base, so
# every finding counts as new.
sha=''
if [ -n "${PR_BASE_SHA:-}" ]; then
  git fetch "${fetch[@]}" origin "$PR_BASE_SHA"
  sha=$(git merge-base "$PR_BASE_SHA" HEAD)
elif [ "$EVENT" = push ] && [ -n "${PUSH_BEFORE:-}" ] && [ "${PUSH_BEFORE//0/}" != '' ]; then
  if git fetch "${fetch[@]}" origin "$PUSH_BEFORE"; then
    sha=$PUSH_BEFORE
  else
    echo "::warning::edgefit could not fetch the commit before this push, so every finding counts as new."
  fi
fi
if [ -z "$sha" ]; then
  echo "::notice::edgefit has no base commit for a $EVENT event, so every finding counts as new."
  echo '{ "version": 1, "targets": [] }' > "$RUNNER_TEMP/edgefit/base.json"
  echo 'has-base=false' >> "$GITHUB_OUTPUT"
  exit 0
fi
# A cached base report is only valid for the same edgefit and inputs.
inputs=$(echo "$CACHE_INPUTS" | sha256sum | cut -c1-16)
echo "sha=$sha" >> "$GITHUB_OUTPUT"
echo 'has-base=true' >> "$GITHUB_OUTPUT"
echo "cache-key=edgefit-base-$IDENTITY-$inputs-$sha" >> "$GITHUB_OUTPUT"
