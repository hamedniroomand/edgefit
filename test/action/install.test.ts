import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vite-plus/test';

import { runScript, temporaryDirectory, write } from './scripts.ts';

/**
 * A stand-in for npm that logs every call and fails `NPM_FAILS` times before an install works. A
 * working install writes the package the way npm would, at the version it was asked for.
 */
const fakeNpm = `#!/usr/bin/env bash
echo "$*" >> "$NPM_LOG"
if [ "$1" != install ]; then exit 0; fi
count=$(cat "$NPM_COUNT" 2> /dev/null || echo 0)
echo $((count + 1)) > "$NPM_COUNT"
if [ "$count" -lt "\${NPM_FAILS:-0}" ]; then exit 1; fi
prefix=$3
spec=\${!#}
version=\${spec##*@}
[ "$version" = "$spec" ] && version=0.0.0-tarball
mkdir -p "$prefix/node_modules/edgefit"
echo "{ \\"name\\": \\"edgefit\\", \\"version\\": \\"$version\\" }" > "$prefix/node_modules/edgefit/package.json"
`;

interface Setup {
  root: string;
  bin: string;
  environment: Record<string, string>;
  npmCalls: () => string[];
}

function setup(actionVersion = '9.9.9'): Setup {
  const root = temporaryDirectory();
  const bin = path.join(root, 'bin');
  const log = path.join(root, 'npm.log');
  write(path.join(bin, 'npm'), fakeNpm, true);
  write(path.join(root, 'action', 'package.json'), `{ "version": "${actionVersion}" }`);
  const environment = {
    PATH: `${bin}:${process.env.PATH ?? ''}`,
    ACTION_PATH: path.join(root, 'action'),
    RUNNER_TEMP: path.join(root, 'temp'),
    NPM_LOG: log,
    NPM_COUNT: path.join(root, 'count'),
    INSTALL_DELAY: '0',
    EDGEFIT_VERSION: '',
    EDGEFIT_PACKAGE: '',
  };
  const npmCalls = (): string[] => readFileSync(log, 'utf8').trim().split('\n');
  return { root, bin, environment, npmCalls };
}

describe('installing edgefit', () => {
  it('installs the version the action was released with and verifies signatures', () => {
    const { root, environment, npmCalls } = setup();
    const run = runScript('install.sh', root, environment);
    expect(run.status).toBe(0);
    expect(npmCalls()[0]).toContain('--ignore-scripts');
    expect(npmCalls()[0]).toMatch(/edgefit@9\.9\.9$/u);
    expect(npmCalls()[1]).toBe('audit signatures');
    expect(run.outputs.identity).toBe('edgefit@9.9.9');
    expect(run.outputs.cli).toBe(
      path.join(root, 'temp', 'edgefit-cli', 'node_modules', 'edgefit', 'dist', 'cli', 'main.mjs'),
    );
  });

  it('installs another version when asked to', () => {
    const { root, environment, npmCalls } = setup();
    const run = runScript('install.sh', root, { ...environment, EDGEFIT_VERSION: '1.2.3' });
    expect(npmCalls()[0]).toMatch(/edgefit@1\.2\.3$/u);
    expect(run.outputs.identity).toBe('edgefit@1.2.3');
  });

  it('installs a tarball without verifying signatures, which it cannot have', () => {
    const { root, environment, npmCalls } = setup();
    const tarball = path.join(root, 'edgefit-0.4.0.tgz');
    const run = runScript('install.sh', root, { ...environment, EDGEFIT_PACKAGE: tarball });
    expect(run.status).toBe(0);
    expect(npmCalls()).toHaveLength(1);
    expect(npmCalls()[0]).toMatch(/edgefit-0\.4\.0\.tgz$/u);
  });
});

describe('installing a release npm does not list yet', () => {
  it('tries again until it is there', () => {
    const { root, environment, npmCalls } = setup();
    const run = runScript('install.sh', root, { ...environment, NPM_FAILS: '2' });
    expect(run.status).toBe(0);
    expect(run.log).toContain('trying again');
    expect(npmCalls().filter(call => call.startsWith('install'))).toHaveLength(3);
  });

  it('fails with a message that says what to do when it never is', () => {
    const { root, environment } = setup();
    const run = runScript('install.sh', root, {
      ...environment,
      NPM_FAILS: '9',
      INSTALL_ATTEMPTS: '2',
    });
    expect(run.status).toBe(1);
    expect(run.log).toContain('Could not install edgefit@9.9.9');
    expect(run.log).toContain('run the job again');
  });
});

describe('the Node.js version', () => {
  it('must be 22.18 or newer', () => {
    const { root, bin, environment } = setup();
    write(
      path.join(bin, 'node'),
      '#!/usr/bin/env bash\n[ "$1" = --version ] && echo v20.11.0\nexit 1\n',
      true,
    );
    const run = runScript('install.sh', root, environment);
    expect(run.status).toBe(1);
    expect(run.log).toContain('needs Node.js 22.18 or newer, and this runner has v20.11.0');
  });
});
