import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vite-plus/test';

import { run } from '@/cli/run.ts';
import { captureIo, fixture } from '~/helpers.ts';

let directory = '';

async function checkJson(entry: string): Promise<unknown> {
  const io = captureIo(fixture('worker'));
  await run(['check', '--format', 'json', '--entry', entry], io);
  return JSON.parse(io.output());
}

async function diff(argv: string[]): Promise<{ code: number; output: string; errors: string }> {
  const io = captureIo(directory);
  const code = await run(['diff', ...argv], io);
  return { code, output: io.output(), errors: io.errors() };
}

beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'edgefit-diff-'));
  const reports = {
    'base.json': await checkJson('src/index.ts'),
    // The dev reload module alone reaches chokidar but not pg-lite.
    'head.json': await checkJson('src/dev/reload.ts'),
    'empty.json': { version: 1, targets: [] },
    'future.json': { version: 99, targets: [] },
    'other.json': { hello: 'world' },
  };
  await Promise.all(
    Object.entries(reports).map(async ([name, report]) => {
      await writeFile(path.join(directory, name), JSON.stringify(report));
    }),
  );
});

describe('edgefit diff', () => {
  it('lists new findings with their package and chain', async () => {
    const { code, output } = await diff(['empty.json', 'head.json']);
    expect(code).toBe(1);
    expect(output).toContain('⚠ Runtime compatibility regression · workerd\n');
    expect(output).toContain(
      'New: node:fs.watch file watching is not implemented; throws ERR_UNSUPPORTED_OPERATION (workerd)\n' +
        '  chokidar@4.0.1 · node_modules/chokidar/index.js:5:13\n' +
        '  via src/dev/reload.ts > chokidar\n',
    );
    expect(output).toContain('1 new, 0 fixed, 0 unchanged');
  });

  it('lists fixed findings and passes when nothing is new', async () => {
    const { code, output } = await diff(['base.json', 'head.json']);
    expect(code).toBe(0);
    expect(output).toContain('✓ No new runtime compatibility findings · workerd');
    expect(output).toContain('Fixed: require(<expression>) cannot be checked statically');
    expect(output).toContain('  pg-lite@0.3.0');
    expect(output).toContain('0 new, 1 fixed, 1 unchanged');
  });

  it('fails on existing errors with --fail-on errors', async () => {
    expect((await diff(['base.json', 'head.json', '--fail-on', 'errors'])).code).toBe(1);
  });

  it('annotates only new findings in the github format', async () => {
    const { output } = await diff(['base.json', 'base.json', '--format', 'github']);
    expect(output).toBe('edgefit: 0 new, 0 fixed, 2 unchanged\n');
    const added = await diff(['empty.json', 'head.json', '--format', 'github']);
    expect(added.output).toMatch(/^::error file=node_modules\/chokidar\/index.js,line=5,/u);
  });
});

describe('edgefit diff formats and input', () => {
  it('prints versioned JSON', async () => {
    const { output } = await diff(['base.json', 'head.json', '--format', 'json']);
    const report = JSON.parse(output) as Record<string, unknown[]>;
    expect(report.version).toBe(1);
    expect(report.targets).toEqual(['workerd']);
    expect([report.new, report.fixed, report.unchanged].map(list => list?.length)).toEqual([
      0, 1, 1,
    ]);
  });

  it.each([
    [['base.json'], 'diff takes two JSON reports'],
    [['base.json', 'missing.json'], 'Cannot read missing.json.'],
    [['base.json', 'other.json'], 'other.json is not an edgefit JSON report.'],
    [['base.json', 'future.json'], 'future.json has report version 99'],
    [['base.json', 'head.json', '--fail-on', 'always'], 'Unknown --fail-on value: always'],
  ])('rejects %j', async (argv, message) => {
    const { code, errors } = await diff(argv);
    expect(code).toBe(2);
    expect(errors).toContain(message);
  });
});
