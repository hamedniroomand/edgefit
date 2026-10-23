import { describe, expect, it } from 'vite-plus/test';

import { check, exitCodeOf } from '@/core/check.ts';
import { formatJson } from '@/report/json.ts';
import { formatText } from '@/report/text.ts';
import { edgefitError } from '~/helpers.ts';
import { project, worker } from '~/targets/pages-project.ts';

const note = 'Pages serves dist as static files, so there is no server code to check on workerd.';
const site = { 'dist/index.html': '<p>hi</p>' };
const marker = (preset: string): Record<string, string> => ({
  'dist/nitro.json': `{ "preset": "${preset}", "date": "2026-10-08T09:00:00.000Z" }`,
});

describe('a Cloudflare Pages output that holds static files only', () => {
  it.each([
    ['no marker, as a Vite or Astro site', site],
    ['a static Nitro marker', { ...site, ...marker('cloudflare_pages_static') }],
    ['a marker that is not JSON', { ...site, 'dist/nitro.json': '{ not json' }],
    ['a marker with no preset name', { ...site, 'dist/nitro.json': '{ "preset": 1 }' }],
    ['a nested file only', { 'dist/assets/app.js': 'console.log(1)' }],
  ])('is a clean result with the note: %s', async (_name, files) => {
    const result = await check({ root: project(files), config: { targets: ['workerd'] } });
    expect(exitCodeOf(result)).toBe(0);
    expect(result.reports).toHaveLength(1);
    expect(result.reports[0]).toMatchObject({ entries: [], modules: 0, findings: [], guarded: [] });
    expect(result.reports[0]?.target.notes).toContain(note);
    expect(formatText(result, { color: false })).toContain(`note: ${note}`);
    const json = JSON.parse(formatJson(result)) as {
      summary: object;
      targets: { key: string; notes: string[]; entries: string[] }[];
    };
    expect(json.summary).toEqual({ errors: 0, warnings: 0 });
    expect(json.targets).toMatchObject([{ key: 'workerd', entries: [] }]);
    expect(json.targets[0]?.notes).toContain(note);
  });

  it.each([
    'cloudflare-pages-static',
    'static',
    'github-pages',
    'gitlab-pages',
    'netlify-static',
    'vercel-static',
    'zeabur-static',
    'zerops-static',
  ])('takes the preset %s, in both spellings, for static files', async preset => {
    for (const spelling of [preset, preset.replaceAll('-', '_')]) {
      // eslint-disable-next-line no-await-in-loop -- one project per spelling
      const result = await check({
        root: project({ ...site, ...marker(spelling) }),
        config: { targets: ['workerd'] },
      });
      expect(exitCodeOf(result)).toBe(0);
      expect(result.reports[0]?.target.notes).toContain(note);
    }
  });
});

describe('a Cloudflare Pages output with static files and other settings', () => {
  it('does not guess a source file, and leaves out the note when an entry is given', async () => {
    const files = { ...site, 'src/index.ts': worker, 'package.json': '{ "main": "src/index.ts" }' };
    const guessed = await check({ root: project(files), config: { targets: ['workerd'] } });
    expect(guessed.reports[0]?.entries).toEqual([]);
    const given = await check({
      root: project(files),
      config: { targets: ['workerd'], entry: 'src/index.ts' },
    });
    expect(given.reports[0]?.entries).toEqual(['src/index.ts']);
    expect(given.reports[0]?.target.notes).not.toContain(note);
  });

  it('names the project root `.` when it is the Pages output folder', async () => {
    const files = { 'wrangler.jsonc': '{ "pages_build_output_dir": "." }', 'index.html': 'x' };
    const result = await check({ root: project(files), config: { targets: ['workerd'] } });
    expect(result.reports[0]?.target.notes).toContain(
      'Pages serves . as static files, so there is no server code to check on workerd.',
    );
  });

  it('runs the other targets as before', async () => {
    const files = { ...site, 'index.ts': worker, 'package.json': '{ "main": "index.ts" }' };
    const result = await check({
      root: project(files),
      config: { targets: ['workerd', 'deno'] },
    });
    expect(result.reports.map(report => [report.target.key, report.entries])).toEqual([
      ['workerd', []],
      ['deno', ['index.ts']],
    ]);
  });

  it('skips a target that has no entry, and still gives the result', async () => {
    const result = await check({ root: project(site), config: { targets: ['workerd', 'deno'] } });
    expect(result.reports.map(report => report.target.key)).toEqual(['workerd']);
    expect(result.skipped.map(target => target.key)).toEqual(['deno']);
    expect(exitCodeOf(result)).toBe(0);
  });
});

async function errorOf(files: Record<string, string>): Promise<string> {
  const error = await edgefitError(
    check({ root: project(files), config: { targets: ['workerd'] } }),
  );
  expect(error.message).toBe('No entry point to scan.');
  return error.hint ?? '';
}

describe('a Cloudflare Pages output that keeps the error', () => {
  it.each([
    ['no output folder', {}],
    ['an empty output folder', { 'dist/': '' }],
    ['an output folder that holds only folders', { 'dist/assets/': '' }],
    ['an output path that is a file', { dist: 'not a folder' }],
    ['an output folder that holds only a dotfile', { 'dist/.gitkeep': '' }],
    ['an output folder that holds only the marker', marker('cloudflare_pages_static')],
    ['a _worker.js folder without index.js', { ...site, 'dist/_worker.js/notes.txt': 'x' }],
    ['a functions/ folder that has no handler', { ...site, 'functions/README.md': '# x' }],
    ['a marker for the Pages server preset', { ...site, ...marker('cloudflare_pages') }],
    ['a marker for the module preset', { ...site, ...marker('cloudflare-module') }],
    ['a marker for a Node server', { ...site, ...marker('node-server') }],
  ])('%s', async (_name, files) => {
    expect(await errorOf(files)).not.toBe('');
  });

  it('asks for a build when the output folder is missing or empty', async () => {
    const cases: Record<string, string>[] = [{}, { 'dist/': '' }];
    for (const files of cases) {
      // eslint-disable-next-line no-await-in-loop -- one project per case
      const hint = await errorOf(files);
      expect(hint).toContain('The Pages output folder dist does not exist or has no files.');
      expect(hint).toContain('Build the project, or check `pages_build_output_dir`');
    }
  });

  it('shows an error that does not mean a missing file, as for a marker that is a folder', async () => {
    const run = check({
      root: project({ ...site, 'dist/nitro.json/notes.txt': 'x' }),
      config: { targets: ['workerd'] },
    });
    await expect(run).rejects.toThrow('EISDIR');
  });

  it('does not ask a static Nitro build for another preset', async () => {
    const hint = await errorOf({
      ...marker('cloudflare-pages-static'),
      'functions/README.md': '# x',
    });
    expect(hint).not.toContain('NITRO_PRESET');
    expect(hint).not.toContain('does not write a Pages worker');
  });
});
