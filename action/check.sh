#!/usr/bin/env bash
# Installs a checkout's dependencies and writes its `edgefit check --format json` report.
# Usage: check.sh <checkout> <report.json>, with the inputs in the environment set by action.yml.
set -euo pipefail

checkout=$1
report=$2
cd "$checkout"

if [ -n "$INSTALL_COMMAND" ]; then
  bash -c "$INSTALL_COMMAND"
elif [ -f pnpm-lock.yaml ]; then
  corepack pnpm install --frozen-lockfile
elif [ -f yarn.lock ]; then
  corepack yarn install
elif [ -f bun.lock ] || [ -f bun.lockb ]; then
  bun install --frozen-lockfile
elif [ -f package-lock.json ]; then
  npm ci
fi

args=(check --format json --root "$WORKING_DIRECTORY")
for target in ${TARGETS//,/ }; do
  args+=(--target "$target")
done
if [ -n "$ENTRY" ]; then
  args+=(--entry "$ENTRY")
fi

# Exit code 1 only means the report has errors; `edgefit diff` decides whether they fail the run.
status=0
node "$EDGEFIT" "${args[@]}" > "$report" || status=$?
if [ "$status" -gt 1 ]; then
  exit "$status"
fi
