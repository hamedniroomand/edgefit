import { describe, expect, it } from 'vite-plus/test';

import { parseCheckArgs } from '@/cli/args.ts';
import { run } from '@/cli/run.ts';
import { check } from '@/core/check.ts';
import { describeEntries, expandEntries } from '@/core/entries.ts';
import { formatJson } from '@/report/json.ts';
import type { TargetKey } from '@/types.ts';
import { captureIo, edgefitError, fixture } from '~/helpers.ts';

const root = fixture('entries');

async function apis(entry: string[]): Promise<string[]> {
  const result = await check({ root, config: { entry } });
  return (result.reports[0]?.findings ?? []).map(finding => finding.api).sort();
}

describe('several entries', () => {
  it('reports the findings of every entry, and a shared one once', async () => {
    expect(await apis(['src/a.ts'])).toEqual(['node:fs.watch', 'node:fs.watchFile']);
    expect(await apis(['src/b.ts'])).toEqual(['node:fs.watch']);
    expect(await apis(['src/a.ts', 'src/b.ts'])).toEqual(['node:fs.watch', 'node:fs.watchFile']);
  });

  it('names every entry in the report and counts each module once', async () => {
    const result = await check({ root, config: { entry: ['src/b.ts', 'src/a.ts', 'src/a.ts'] } });
    expect(result.reports[0]?.entries).toEqual(['src/a.ts', 'src/b.ts']);
    expect(result.reports[0]?.modules).toBe(3);
  });

  it('shows the nearest entry in the import chain', async () => {
    const result = await check({ root, config: { entry: ['src/a.ts', 'src/b.ts'] } });
    const watch = result.reports[0]?.findings.find(finding => finding.api === 'node:fs.watch');
    expect(watch?.chain[0]).toMatch(/^src\/[ab]\.ts$/u);
  });

  it('gives the same report for repeated --entry, a glob and the config array', async () => {
    const expected = formatJson(await check({ root, config: { entry: ['src/a.ts', 'src/b.ts'] } }));
    const outputs = await Promise.all(
      [
        ['--entry', 'src/a.ts', '--entry', 'src/b.ts'],
        ['--entry', 'src/{a,b}.ts'],
      ].map(async entries => {
        const io = captureIo(root);
        await run(['check', '--format', 'json', ...entries], io);
        return io.output();
      }),
    );
    expect(outputs).toEqual([expected, expected]);
  });
});

describe('entry arguments', () => {
  it('reads --entry more than once', () => {
    expect(parseCheckArgs(['--entry', 'a.ts', '--entry', 'b.ts']).entry).toEqual(['a.ts', 'b.ts']);
  });
});

describe('entry globs', () => {
  it('expands, sorts and dedupes, and skips node_modules', () => {
    expect(expandEntries(root, ['src/routes/*.ts', 'src/routes/x.ts'])).toEqual([
      'src/routes/x.ts',
      'src/routes/y.ts',
    ]);
    expect(expandEntries(root, ['**/x.ts'])).toEqual(['src/routes/x.ts']);
  });

  it('fails when a pattern matches nothing', async () => {
    const error = await edgefitError(check({ root, config: { entry: 'src/none/*.ts' } }));
    expect(error.message).toBe('No file matches the entry pattern src/none/*.ts.');
  });

  it('keeps a plain path that does not exist, so the build reports it', () => {
    expect(expandEntries(root, ['src/missing.ts'])).toEqual(['src/missing.ts']);
  });
});

describe('entries per target', () => {
  it('lets a target without entries use the first target that has some, and says so', async () => {
    const result = await check({
      root: fixture('worker'),
      config: { targets: ['workerd', 'bun'] },
    });
    const [workerd, bun] = result.reports;
    expect(workerd?.entries).toEqual(['src/index.ts']);
    expect(bun?.entries).toEqual(['src/index.ts']);
    expect(bun?.target.settings).toContain('entries from workerd: wrangler.jsonc "main"');
    expect(workerd?.target.settings).toContain('entries from wrangler.jsonc "main"');
  });

  it('lets an explicit entry win for every target', async () => {
    const result = await check({
      root: fixture('worker'),
      config: { targets: ['workerd', 'bun'], entry: 'src/dev/reload.ts' },
    });
    expect(result.reports.map(report => report.entries)).toEqual([
      ['src/dev/reload.ts'],
      ['src/dev/reload.ts'],
    ]);
  });

  it('checks every Netlify function without --entry', async () => {
    const result = await check({
      root: fixture('netlify-multi'),
      config: { targets: ['netlify-edge'] },
    });
    expect(result.reports[0]?.entries).toEqual([
      'netlify/edge-functions/a.ts',
      'netlify/edge-functions/b.ts',
    ]);
  });
});

describe('a target without an entry', () => {
  const config = { targets: ['workerd', 'vercel-edge'] as TargetKey[] };

  it('is skipped, and the report says what it searched', async () => {
    const result = await check({ root: fixture('worker'), config });
    expect(result.reports.map(report => report.target.key)).toEqual(['workerd']);
    expect(result.skipped.map(({ key }) => key)).toEqual(['vercel-edge']);
    expect(result.skipped[0]?.searched[0]).toContain('middleware.{ts,js,mts,mjs}');
    const io = captureIo(fixture('worker'));
    await run(['check', '--target', 'workerd', '--target', 'vercel-edge', '--no-color'], io);
    expect(io.output()).toContain(
      'edgefit · vercel-edge skipped: No entry found. Searched: middleware.{ts,js,mts,mjs}',
    );
  });

  it('is listed in the JSON report', async () => {
    const result = await check({ root: fixture('worker'), config });
    const report = JSON.parse(formatJson(result)) as { skipped: unknown };
    expect(report.skipped).toEqual(result.skipped);
  });
});

describe('entry text', () => {
  it('names one entry, a few, and shortens a long list', () => {
    expect(describeEntries(['a.ts'])).toBe('entry a.ts');
    expect(describeEntries(['a.ts', 'b.ts', 'c.ts'])).toBe('entries a.ts, b.ts, c.ts');
    expect(describeEntries(['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'])).toBe(
      'entries a.ts, b.ts, c.ts +2 more',
    );
  });
});
