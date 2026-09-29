#!/usr/bin/env bash
# Installs the edgefit CLI the action runs, and writes its path (`cli`) and what identifies it in
# a cache key (`identity`) to $GITHUB_OUTPUT.
# Environment: ACTION_PATH, RUNNER_TEMP, GITHUB_OUTPUT, and the inputs
#   EDGEFIT_VERSION  empty: the version this action was released with. `source`: build this checkout.
#   EDGEFIT_PACKAGE  a tarball to install instead, for testing the package before it is published.
# INSTALL_ATTEMPTS and INSTALL_DELAY (seconds) set the retries.
set -euo pipefail

version=${EDGEFIT_VERSION:-}
package=${EDGEFIT_PACKAGE:-}

if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 18) ? 0 : 1)'; then
  echo "::error::edgefit needs Node.js 22.18 or newer, and this runner has $(node --version). Add actions/setup-node before this step."
  exit 1
fi

if [ "$version" = source ]; then
  # Builds this checkout instead of installing a release. Kept for one release as an escape hatch.
  cd "$ACTION_PATH"
  command -v corepack > /dev/null || npm install --global corepack
  corepack pnpm install --frozen-lockfile
  corepack pnpm --filter edgefit run build
  build=$(find dist data -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -c1-16)
  echo "cli=$ACTION_PATH/dist/cli/main.mjs" >> "$GITHUB_OUTPUT"
  echo "identity=edgefit-source-$build" >> "$GITHUB_OUTPUT"
  exit 0
fi

if [ -n "$package" ]; then
  spec=$package
else
  # The tag holds package.json, so the version needs no editing at release time.
  version=${version:-$(node -p "require('$ACTION_PATH/package.json').version")}
  spec="edgefit@$version"
fi

destination="$RUNNER_TEMP/edgefit-cli"
attempts=${INSTALL_ATTEMPTS:-6}
delay=${INSTALL_DELAY:-10}
for attempt in $(seq 1 "$attempts"); do
  if npm install --prefix "$destination" --ignore-scripts --no-audit --no-fund "$spec"; then
    break
  fi
  if [ "$attempt" -eq "$attempts" ]; then
    echo "::error::Could not install $spec. If it was released a moment ago, npm may not list it yet: run the job again in a minute."
    exit 1
  fi
  echo "Could not install $spec yet, trying again in ${delay}s ($attempt of $attempts)."
  sleep "$delay"
done

installed=$(node -p "require('$destination/node_modules/edgefit/package.json').version")
if [ -z "$package" ]; then
  # Verifies the registry signatures and the provenance of what was installed.
  (cd "$destination" && npm audit signatures)
fi
echo "cli=$destination/node_modules/edgefit/dist/cli/main.mjs" >> "$GITHUB_OUTPUT"
echo "identity=edgefit@$installed" >> "$GITHUB_OUTPUT"
