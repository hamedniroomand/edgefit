import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import { createWorkerdTarget } from '@/targets/workerd/index.ts';
import { edgefitError } from '~/helpers.ts';

const pagesConfig = '{ "name": "app", "pages_build_output_dir": "dist" }';

function project(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'edgefit-pages-'));
  for (const [name, text] of Object.entries({ 'wrangler.jsonc': pagesConfig, ...files })) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

const worker = 'export default { fetch: () => new Response("ok") };\n';

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

async function hintFor(
  files: Record<string, string>,
  targets: ('workerd' | 'deno')[] = ['workerd'],
): Promise<string> {
  const error = await edgefitError(check({ root: project(files), config: { targets } }));
  expect(error.message).toBe('No entry point to scan.');
  return error.hint ?? '';
}

describe('Cloudflare Pages without server code', () => {
  it('says there is none for static files, and does not guess a source file', async () => {
    const hint = await hintFor({
      'dist/index.html': '<p>hi</p>',
      'src/index.ts': worker,
      'package.json': '{ "main": "src/index.ts" }',
    });
    expect(hint).toContain('There is no server code to check.');
    expect(hint).toContain('wrangler.jsonc "pages_build_output_dir": dist/_worker.js');
    expect(hint).not.toContain('Pass --entry');
  });

  it('does not take a guess or an entry from another target', async () => {
    const root = project({
      'dist/index.html': '<p>hi</p>',
      'index.ts': worker,
      'package.json': '{ "main": "index.ts" }',
    });
    const { reports } = await check({ root, config: { targets: ['workerd', 'deno'] } });
    expect(reports.map(report => report.target.key)).toEqual(['deno']);
  });

  it('says there is no server code when the folder is outside the root', async () => {
    const hint = await hintFor({ 'wrangler.jsonc': '{ "pages_build_output_dir": "../dist" }' });
    expect(hint).toContain('There is no server code to check.');
  });

  it('keeps the generic advice for a target that has none', async () => {
    const hint = await hintFor({ 'dist/index.html': '<p>hi</p>' }, ['workerd', 'deno']);
    expect(hint).toContain('There is no server code to check.');
    expect(hint).toContain('Pass --entry');
  });

  it('tells a framework project to build first', async () => {
    const hint = await hintFor({ 'package.json': '{ "devDependencies": { "nuxt": "^4.0.0" } }' });
    expect(hint).toContain('This project uses nuxt, and dist has no _worker.js.');
    expect(hint).toContain('then run `edgefit check` again');
    expect(hint).not.toContain('Pass --entry');
  });
});

describe('Cloudflare Pages with a Nitro build', () => {
  it('names the preset of a build that is not for Pages', async () => {
    const hint = await hintFor({ '.output/nitro.json': '{ "preset": "node-server" }' });
    expect(hint).toContain('The Nitro build used the preset node-server');
    expect(hint).toContain('NITRO_PRESET=cloudflare_pages');
    expect(hint).toContain('then run `edgefit check` again');
  });

  it('reads the preset next to the build output, in any spelling', async () => {
    const hint = await hintFor({ 'dist/nitro.json': '{ "preset": "cloudflare_module" }' });
    expect(hint).toContain('preset cloudflare-module');
  });

  it('does not take cloudflare-pages-static for a build with a worker', async () => {
    const hint = await hintFor({ 'dist/nitro.json': '{ "preset": "cloudflare-pages-static" }' });
    expect(hint).toContain('preset cloudflare-pages-static');
  });

  it.each(['{ "preset": "cloudflare_pages" }', '{ not json', '{ "preset": 1 }'])(
    'ignores the marker %s',
    async marker => {
      expect(await hintFor({ 'dist/nitro.json': marker })).toContain('There is no server code');
    },
  );
});
