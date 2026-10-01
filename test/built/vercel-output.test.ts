import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { builtEntries } from '@/built/entry.ts';
import { staleNote } from '@/built/stale.ts';
import { isVercelOutput, readVercelOutput } from '@/built/vercel-output.ts';
import { run } from '@/cli/run.ts';
import { check } from '@/core/check.ts';
import { captureIo, edgefitError, fixture } from '~/helpers.ts';

const root = fixture('vercel-output');
const output = '.vercel/output';
const functions = `${output}/functions`;
const secret = 's3cr3t-fake-value';

describe('reading a Vercel Build Output API layout', () => {
  it('takes every Edge function once, by its entrypoint', () => {
    const { files, unreadable } = readVercelOutput(root, output);
    expect(files).toEqual([
      `${functions}/api/edge.func/server/index.js`,
      `${functions}/middleware.func/index.js`,
    ]);
    expect(unreadable).toEqual([
      `${functions}/bad.func/.vc-config.json`,
      `${functions}/null.func/.vc-config.json`,
    ]);
  });

  it('skips Node.js functions, a missing entrypoint and a symlink to a function', () => {
    const { files } = readVercelOutput(root, output);
    expect(files.join('\n')).not.toMatch(/node\.func|missing|rsc/u);
  });

  it('knows the layout from the output folder or its functions folder, and nothing else', () => {
    expect(isVercelOutput(root, path.join(root, output))).toBe(true);
    expect(isVercelOutput(root, path.join(root, functions))).toBe(true);
    expect(isVercelOutput(root, path.join(root, 'nothing'))).toBe(false);
  });

  it('builds the entry list for --built, and names a function it could not read', () => {
    const built = builtEntries(root, output);
    expect(built.entries).toHaveLength(2);
    expect(built.notes.join('\n')).toContain(
      `${functions}/bad.func/.vc-config.json could not be read`,
    );
  });

  it('fails when the layout has no Edge function', async () => {
    const error = await edgefitError(
      Promise.resolve().then(() => builtEntries(fixture('vercel-output-node-only'), output)),
    );
    expect(error.message).toBe(`No Edge functions found in ${output}.`);
  });
});

describe('what the config files can leak', () => {
  it.each(['text', 'json', 'github'])(
    'keeps environment values out of the %s output',
    async format => {
      const io = captureIo(root);
      await run(
        ['check', '--target', 'vercel-edge', '--built', output, '--format', format, '--no-color'],
        io,
      );
      // The GitHub format has annotations for findings only, and no notes.
      expect(io.output()).toContain(format === 'github' ? '::error' : 'could not be read');
      expect(io.output()).not.toContain(secret);
    },
  );

  it('keeps them out of the notes and the errors of a result', async () => {
    const result = await check({ root, built: output, config: { targets: ['vercel-edge'] } });
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});

describe('finding Edge functions without --built', () => {
  it('uses the build output when the source has no entry, and says so', async () => {
    const [report] = (await check({ root, config: { targets: ['vercel-edge'] } })).reports;
    expect(report?.entries).toHaveLength(2);
    expect(report?.target.settings).toContain('entries from .vercel/output (build output)');
    expect(report?.findings.map(finding => finding.api)).toEqual(
      expect.arrayContaining(['node:process.nextTick', 'setImmediate']),
    );
  });

  it('prefers the source entries, and --built forces the output', async () => {
    const source = fixture('vercel-output-source');
    const config = { targets: ['vercel-edge' as const] };
    const [auto] = (await check({ root: source, config })).reports;
    const [forced] = (await check({ root: source, config, built: output })).reports;
    expect(auto?.entries).toEqual(['middleware.ts']);
    expect(forced?.entries).toEqual([`${functions}/built.func/index.js`]);
  });
});

describe('build output that is older than the code', () => {
  function project(): string {
    const directory = mkdtempSync(path.join(tmpdir(), 'edgefit-stale-'));
    mkdirSync(path.join(directory, 'src'));
    writeFileSync(path.join(directory, 'out.js'), '');
    writeFileSync(path.join(directory, 'package.json'), '{}');
    writeFileSync(path.join(directory, 'pnpm-lock.yaml'), '');
    writeFileSync(path.join(directory, 'src/page.ts'), '');
    return directory;
  }
  const at = (directory: string, file: string, seconds: number): void => {
    utimesSync(path.join(directory, file), seconds, seconds);
  };

  it('says which file is newer than the output', () => {
    const directory = project();
    for (const file of ['out.js', 'package.json', 'pnpm-lock.yaml', 'src/page.ts']) {
      at(directory, file, 1_000_000);
    }
    at(directory, 'src/page.ts', 2_000_000);
    expect(staleNote(directory, ['out.js'], [])).toEqual([
      'The build output is older than src/page.ts. Build again, or the report may not match the code.',
    ]);
  });

  it('compares with the lockfile and the sources it is given', () => {
    const directory = project();
    for (const file of ['out.js', 'package.json', 'pnpm-lock.yaml', 'src/page.ts']) {
      at(directory, file, 1_000_000);
    }
    at(directory, 'pnpm-lock.yaml', 3_000_000);
    expect(staleNote(directory, ['out.js'], [])[0]).toContain('pnpm-lock.yaml');
    writeFileSync(path.join(directory, 'route.ts'), '');
    at(directory, 'route.ts', 4_000_000);
    expect(staleNote(directory, ['out.js'], ['route.ts'])[0]).toContain('route.ts');
  });

  it('says nothing when the output is the newest', () => {
    const directory = project();
    for (const file of ['package.json', 'pnpm-lock.yaml', 'src/page.ts']) {
      at(directory, file, 1_000_000);
    }
    at(directory, 'out.js', 2_000_000);
    expect(staleNote(directory, ['out.js'], [])).toEqual([]);
  });
});
