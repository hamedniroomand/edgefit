import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { run } from '@/cli/run.ts';
import { captureIo, fixture } from '~/helpers.ts';

describe('edgefit check', () => {
  it('prints findings as text and exits with 1 on errors', async () => {
    const io = captureIo(fixture('worker'));
    expect(await run(['check'], io)).toBe(1);
    expect(io.output()).toContain('error    unsupported  node:fs.watch  (workerd)');
    expect(io.output()).toContain('via src/index.ts > src/dev/reload.ts > chokidar');
    expect(io.output()).toContain('1 error, 1 warning');
  });

  it('prints versioned JSON', async () => {
    const io = captureIo(fixture('worker'));
    await run(['check', '--format', 'json'], io);
    const report = JSON.parse(io.output()) as { version: number; summary: unknown };
    expect(report.version).toBe(1);
    expect(report.summary).toEqual({ errors: 1, warnings: 1 });
  });

  it('prints GitHub annotations', async () => {
    const io = captureIo(fixture('worker'));
    await run(['check', '--format', 'github'], io);
    expect(io.output()).toMatch(
      /^::error file=node_modules\/chokidar\/index\.js,line=5,col=13,title=edgefit%3A unsupported on workerd::/mu,
    );
  });

  it('applies the config file from --root', async () => {
    const io = captureIo(fixture('worker'));
    expect(await run(['check', '--root', '../configured'], io)).toBe(1);
    expect(io.output()).not.toContain('child_process');
    expect(io.output()).toContain('mocked  node:dgram.createSocket');
    expect(io.output()).toContain('error    mismatch  node:process.release.lts');
    expect(io.output()).toContain('1 ignored');
  });

  it('exits with 0 when only warnings remain', async () => {
    const io = captureIo(fixture('worker'));
    expect(await run(['check', '--entry', 'node_modules/pg-lite/lib/index.js'], io)).toBe(0);
  });
});

describe('edgefit check --built', () => {
  it('scans a Nitro build and reports the mocks unenv injected', async () => {
    const io = captureIo(fixture('nitro-app'));
    expect(await run(['check', '--built', '.output/server'], io)).toBe(1);
    expect(io.output()).toContain('entry .output/server/index.mjs · 3 modules');
    expect(io.output()).toContain('error    mocked  node:fs  (workerd)');
    expect(io.output()).toContain('task-lock@2.1.0  node_modules/task-lock/index.js:2:');
  });
});

describe('edgefit check on bun', () => {
  it('checks the bun target', async () => {
    const io = captureIo(fixture('bun-app'));
    expect(await run(['check', '--target', 'bun', '--entry', 'src/index.ts'], io)).toBe(1);
    expect(io.output()).toContain('edgefit · bun (Bun)');
    expect(io.output()).toContain('error    mocked  node:async_hooks.createHook  (bun)');
    expect(io.output()).toContain('note: Bun 1.2.0 is older than the data (1.3.13)');
  });

  it('checks several targets in one run', async () => {
    const io = captureIo(fixture('worker'));
    expect(await run(['check', '--target', 'workerd', '--target', 'bun'], io)).toBe(1);
    expect(io.output()).toContain('edgefit · workerd (Cloudflare Workers)');
    expect(io.output()).toContain('edgefit · bun (Bun)');
    expect(io.output()).toContain('unsupported  node:fs.watch  (workerd)');
    expect(io.output()).not.toContain('node:fs.watch  (bun)');
  });
});

describe('edgefit check on deno', () => {
  it('checks the deno-deploy target', async () => {
    const io = captureIo(fixture('deno-app'));
    expect(await run(['check', '--target', 'deno-deploy', '--entry', 'src/main.ts'], io)).toBe(1);
    expect(io.output()).toContain('edgefit · deno-deploy (Deno Deploy)');
    expect(io.output()).toContain('unsupported  node:v8.takeCoverage  (deno-deploy)');
    expect(io.output()).toContain('note: Deno 2.5.0 is older than the data (2.7.13)');
  });
});

describe('edgefit input errors', () => {
  it.each([
    [['check', '--target', 'netlify'], 'Unknown target: netlify'],
    [['check', '--format', 'xml'], 'Unknown format: xml'],
    [['check', '--built', '.output', '--entry', 'src/index.ts'], 'either --entry or --built'],
    [['check', '--bogus'], "Unknown option '--bogus'"],
    [['deploy'], 'Unknown command: deploy'],
  ])('exits with 2 for %j', async (argv, message) => {
    const io = captureIo(fixture('worker'));
    expect(await run(argv, io)).toBe(2);
    expect(io.errors()).toContain(message);
  });
});

describe('edgefit targets and help', () => {
  it('lists targets with their data version', async () => {
    const io = captureIo(fixture('worker'));
    expect(await run(['targets'], io)).toBe(0);
    expect(io.output()).toContain('workerd  Cloudflare Workers');
    expect(io.output()).toContain('workers-nodejs-compat-matrix@ee58120');
    expect(io.output()).toContain('overrides/workerd (workerd 1.20260424.1)');
    expect(io.output()).toContain('bun  Bun');
    expect(io.output()).toContain('overrides/bun (bun 1.3.13)');
    expect(io.output()).toContain('deno  Deno');
    expect(io.output()).toContain('deno-deploy  Deno Deploy');
    expect(io.output()).toContain('overrides/deno (deno 2.7.13)');
  });

  it('prints help without a command', async () => {
    const io = captureIo(fixture('worker'));
    expect(await run([], io)).toBe(0);
    expect(io.output()).toContain('Usage: edgefit <command> [options]');
  });
});

describe('edgefit --version', () => {
  const { version } = JSON.parse(
    readFileSync(path.join(import.meta.dirname, '../../package.json'), 'utf8'),
  ) as { version: string };

  it('prints the package version and exits with 0', async () => {
    const io = captureIo(fixture('worker'));
    expect(await run(['--version'], io)).toBe(0);
    expect(io.output()).toBe(`${version}\n`);
  });

  it('accepts -v', async () => {
    const io = captureIo(fixture('worker'));
    expect(await run(['-v'], io)).toBe(0);
    expect(io.output()).toBe(`${version}\n`);
  });

  it('is listed in the help', async () => {
    const io = captureIo(fixture('worker'));
    await run(['help'], io);
    expect(io.output()).toContain('--version');
  });
});
