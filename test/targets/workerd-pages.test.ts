import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import { createWorkerdTarget } from '@/targets/workerd/index.ts';
import { edgefitError } from '~/helpers.ts';
import { project, worker } from '~/targets/pages-project.ts';

describe('Cloudflare Pages entries', () => {
  it('uses _worker.js in the build output as build output', () => {
    const { entries } = createWorkerdTarget(project({ 'dist/_worker.js': worker }));
    expect(entries.exact).toMatchObject({
      files: ['dist/_worker.js'],
      source: 'wrangler.jsonc "pages_build_output_dir": dist/_worker.js',
      built: true,
    });
  });

  it('uses index.js of a _worker.js folder', () => {
    const { entries } = createWorkerdTarget(project({ 'dist/_worker.js/index.js': worker }));
    expect(entries.exact?.files).toEqual(['dist/_worker.js/index.js']);
  });

  it('reads the folder from wrangler.toml, relative to the config', () => {
    const root = project({ 'out/_worker.js': worker });
    writeFileSync(path.join(root, 'wrangler.toml'), 'pages_build_output_dir = "out"\n');
    writeFileSync(path.join(root, 'wrangler.jsonc'), '{}');
    // The toml is read when the config option names it.
    const { entries } = createWorkerdTarget(root, { wranglerConfig: 'wrangler.toml' });
    expect(entries.exact?.files).toEqual(['out/_worker.js']);
  });
});

describe('Cloudflare Pages functions', () => {
  it('uses every file of functions/ that Pages accepts', () => {
    const { entries } = createWorkerdTarget(
      project({
        'functions/index.ts': worker,
        'functions/_middleware.js': worker,
        'functions/api/[id].mjs': worker,
        'functions/page.tsx': worker,
        'functions/README.md': '# functions',
        'functions/style.css': 'a {}',
      }),
    );
    expect(entries.exact).toMatchObject({
      files: [
        'functions/_middleware.js',
        'functions/api/[id].mjs',
        'functions/index.ts',
        'functions/page.tsx',
      ],
      source: 'the functions/ folder',
      built: false,
    });
  });

  it('prefers _worker.js to functions/, as Pages does', () => {
    const { entries } = createWorkerdTarget(
      project({ 'dist/_worker.js': worker, 'functions/index.ts': worker }),
    );
    expect(entries.exact?.files).toEqual(['dist/_worker.js']);
  });
});

describe('Cloudflare Pages settings', () => {
  it('reads the folder relative to a redirected config', () => {
    const { entries } = createWorkerdTarget(
      project({
        '.wrangler/deploy/config.json': '{ "configPath": "../../build/wrangler.json" }',
        'build/wrangler.json': '{ "pages_build_output_dir": "./static" }',
        'build/static/_worker.js': worker,
      }),
    );
    expect(entries.exact?.files).toEqual(['build/static/_worker.js']);
  });

  it('leaves a project with main to its main', () => {
    const { entries } = createWorkerdTarget(
      project({
        'wrangler.jsonc': '{ "main": "src/worker.ts", "pages_build_output_dir": "dist" }',
        'src/worker.ts': worker,
        'functions/index.ts': worker,
      }),
    );
    expect(entries.exact?.files).toEqual(['src/worker.ts']);
    expect(entries.searched.join('\n')).not.toContain('pages_build_output_dir');
  });

  it('shows where the entry came from in a report', async () => {
    const root = project({ 'dist/_worker.js': worker });
    const { reports } = await check({ root, config: { targets: ['workerd'] } });
    expect(reports[0]?.target.settings).toContain('pages_build_output_dir');
  });
});

async function hintFor(files: Record<string, string>): Promise<string> {
  const error = await edgefitError(
    check({ root: project(files), config: { targets: ['workerd'] } }),
  );
  expect(error.message).toBe('No entry point to scan.');
  return error.hint ?? '';
}

const checkAgain = 'Then run `edgefit check` again.';

describe('Cloudflare Pages without an output folder', () => {
  it('says the folder is missing, also when it is outside the root', async () => {
    const name = `../missing-${randomUUID()}`;
    const hint = await hintFor({ 'wrangler.jsonc': `{ "pages_build_output_dir": "${name}" }` });
    expect(hint).toContain(`The Pages output folder ${name} does not exist or has no files.`);
    expect(hint).toContain(`wrangler.jsonc "pages_build_output_dir": ${name}/_worker.js`);
    expect(hint).toContain(
      `Build the project, or check \`pages_build_output_dir\` in your wrangler config. ${checkAgain}`,
    );
    expect(hint).not.toContain('Pass --entry');
  });

  it('tells a framework project to build first', async () => {
    const hint = await hintFor({ 'package.json': '{ "devDependencies": { "nuxt": "^4.0.0" } }' });
    expect(hint).toContain(
      'This project uses `nuxt`. The Pages output folder dist does not exist or has no files.',
    );
    expect(hint).toContain('Build the project for Cloudflare Pages, or check');
    expect(hint).toContain(checkAgain);
    expect(hint).not.toContain('Pass --entry');
  });

  it('does not take a guess or an entry from another target', async () => {
    const root = project({ 'index.ts': worker, 'package.json': '{ "main": "index.ts" }' });
    const { reports } = await check({ root, config: { targets: ['workerd', 'deno'] } });
    expect(reports.map(report => report.target.key)).toEqual(['deno']);
  });

  it('keeps the generic advice for a target that has none', async () => {
    const error = await edgefitError(
      check({ root: project({}), config: { targets: ['workerd', 'deno'] } }),
    );
    expect(error.hint).toContain('The Pages output folder dist does not exist or has no files.');
    expect(error.hint).toContain('Pass --entry');
  });
});

const dated = (preset: string, date?: string): string =>
  JSON.stringify(date === undefined ? { preset } : { preset, date });
const built = { 'dist/index.html': 'x' };

describe('Cloudflare Pages with a Nitro marker for the Pages server preset', () => {
  const stale = {
    ...built,
    'dist/nitro.json': dated('cloudflare_pages', '2026-10-08T09:00:00.000Z'),
  };

  it('shows the date of the marker and says the folder has no worker', async () => {
    const hint = await hintFor(stale);
    expect(hint).toContain(
      'The Nitro marker dist/nitro.json names the preset cloudflare-pages and the build date 2026-10-08 UTC.',
    );
    expect(hint).toContain('The Pages output folder dist has no worker.');
    expect(hint).not.toContain('older build');
    expect(hint).toContain(
      'A static build with this preset writes no worker, so for static files only, build with NITRO_PRESET=cloudflare-pages-static.',
    );
    expect(hint).toContain(`For a server, build the project for Cloudflare Pages. ${checkAgain}`);
  });

  it('names a newer .output build that used another preset', async () => {
    const hint = await hintFor({
      ...stale,
      '.output/nitro.json': dated('node-server', '2026-10-22T12:00:00.000Z'),
    });
    expect(hint).toContain(
      'The Nitro marker .output/nitro.json names the preset node-server and the build date 2026-10-22 UTC.',
    );
    expect(hint).toContain('That build is newer, and it wrote its files in .output, not in dist.');
  });

  it.each([
    ['an older date', dated('node-server', '2026-10-01T00:00:00.000Z')],
    ['the same preset', dated('cloudflare-pages', '2026-10-22T12:00:00.000Z')],
    ['no date', dated('node-server')],
    ['a date that is not a date', dated('node-server', 'soon')],
  ])('leaves out a .output marker with %s', async (_name, text) => {
    const hint = await hintFor({ ...stale, '.output/nitro.json': text });
    expect(hint).not.toContain('.output/nitro.json');
  });

  it('says the same for a folder that has a worker folder without index.js', async () => {
    const hint = await hintFor({ ...stale, 'dist/_worker.js/other.js': worker });
    expect(hint).toContain('The Pages output folder dist has no worker.');
  });
});

describe('Cloudflare Pages with a Nitro marker for another preset', () => {
  it('names the preset and the date of a build that is not for Pages', async () => {
    const hint = await hintFor({
      '.output/nitro.json': dated('node-server', '2026-10-22T12:00:00.000Z'),
    });
    expect(hint).toContain(
      'The Nitro marker .output/nitro.json names the preset node-server and the build date 2026-10-22 UTC.',
    );
    expect(hint).toContain('That preset does not write a Pages worker.');
    expect(hint).toContain(`Build with NITRO_PRESET=cloudflare_pages. ${checkAgain}`);
  });

  it('reads the preset next to the build output, in any spelling, with no date', async () => {
    const hint = await hintFor({ ...built, 'dist/nitro.json': dated('cloudflare_module') });
    expect(hint).toContain('The Nitro marker dist/nitro.json names the preset cloudflare-module.');
    expect(hint).not.toContain('build date');
  });

  it('names a newer .output build of another preset too', async () => {
    const hint = await hintFor({
      ...built,
      'dist/nitro.json': dated('node-server', '2026-10-08T09:00:00.000Z'),
      '.output/nitro.json': dated('cloudflare-module', '2026-10-22T12:00:00.000Z'),
    });
    expect(hint).toContain(
      'The Nitro marker .output/nitro.json names the preset cloudflare-module',
    );
    expect(hint).toContain('That build is newer');
  });

  it('says there is no server code when a folder holds no worker and no marker', async () => {
    const hint = await hintFor({ ...built, 'functions/README.md': '# x' });
    expect(hint).toContain('edgefit found no server code in dist/_worker.js or in functions/.');
    expect(hint).toContain('A _worker.js folder needs an index.js file.');
    expect(hint).not.toContain('NITRO_PRESET');
  });
});
