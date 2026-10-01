import { describe, expect, it } from 'vite-plus/test';

import { builtEntries } from '@/built/entry.ts';
import { isNetlifyOutput, readNetlifyOutput } from '@/built/netlify-output.ts';
import { run } from '@/cli/run.ts';
import { check } from '@/core/check.ts';
import { captureIo, edgefitError, fixture } from '~/helpers.ts';

const legacy = fixture('netlify-output-legacy');
const v1 = fixture('netlify-output-v1');
const manifest = '.netlify/edge-functions';
const frameworks = '.netlify/v1/edge-functions';

describe('reading Netlify framework output', () => {
  it('takes the functions a manifest names, and skips one whose file is missing', () => {
    expect(readNetlifyOutput(legacy, '.netlify')).toEqual({
      files: [`${manifest}/render.js`],
      unreadable: [],
    });
  });

  it('takes every function file in the Frameworks API folder, and no map or import map', () => {
    expect(readNetlifyOutput(v1, '.netlify').files).toEqual([
      `${frameworks}/a.ts`,
      `${frameworks}/b/index.js`,
    ]);
  });

  it('knows the layout from .netlify or from either folder, and nothing else', () => {
    expect(isNetlifyOutput(legacy, '.netlify')).toBe(true);
    expect(isNetlifyOutput(legacy, manifest)).toBe(true);
    expect(isNetlifyOutput(v1, frameworks)).toBe(true);
    expect(isNetlifyOutput(legacy, 'nothing')).toBe(false);
    expect(isNetlifyOutput(fixture('worker'), '.netlify')).toBe(false);
  });

  it('names a manifest it could not read, and not what is in it', () => {
    const bad = fixture('netlify-output-bad');
    expect(readNetlifyOutput(bad, '.netlify')).toEqual({
      files: [],
      unreadable: [`${manifest}/manifest.json`],
    });
  });
});

describe('a manifest next to functions that can be read', () => {
  const mixed = fixture('netlify-output-mixed');

  it('skips the manifest, says so, and keeps the functions', async () => {
    expect(readNetlifyOutput(mixed, '.netlify')).toEqual({
      files: [`${frameworks}/a.ts`],
      unreadable: [`${manifest}/manifest.json`],
    });
    const note = `${manifest}/manifest.json could not be read, so its functions were skipped.`;
    expect(builtEntries(mixed, '.netlify').notes).toContain(note);
    const [report] = (await check({ root: mixed, config: { targets: ['netlify-edge'] } })).reports;
    expect(report?.target.notes).toContain(note);
    expect(JSON.stringify(report)).not.toContain('marker-fake-value');
  });
});

describe('--built with Netlify framework output', () => {
  it.each([
    [legacy, '.netlify', `${manifest}/render.js`],
    [legacy, manifest, `${manifest}/render.js`],
    [v1, frameworks, `${frameworks}/a.ts`],
  ])('takes the functions of %s %s', (root, built, first) => {
    expect(builtEntries(root, built).entries[0]).toBe(first);
  });

  it('fails when the output names no function', async () => {
    const error = await edgefitError(
      Promise.resolve().then(() => builtEntries(fixture('netlify-output-empty'), '.netlify')),
    );
    expect(error.message).toBe('No edge functions found in .netlify.');
  });

  it.each(['text', 'json'])(
    'keeps what a bad manifest holds out of the %s output',
    async format => {
      const io = captureIo(fixture('netlify-output-bad'));
      const argv = ['check', '--target', 'netlify-edge', '--built', '.netlify', '--format', format];
      await run(argv, io);
      expect(io.output() + io.errors()).not.toContain('marker-fake-value');
    },
  );
});

describe('finding Netlify framework output without --built', () => {
  const config = { targets: ['netlify-edge' as const] };

  it('uses the output when the project has no function, and says so', async () => {
    const [report] = (await check({ root: legacy, config })).reports;
    expect(report?.entries).toEqual([`${manifest}/render.js`]);
    expect(report?.target.settings).toContain('(build output)');
  });

  it('reads the Frameworks API folder too', async () => {
    const [report] = (await check({ root: v1, config })).reports;
    expect(report?.entries).toEqual([`${frameworks}/a.ts`, `${frameworks}/b/index.js`]);
  });

  it('checks the project functions and the framework ones together', async () => {
    const [report] = (await check({ root: fixture('netlify-output-union'), config })).reports;
    expect(report?.entries).toEqual([`${manifest}/render.js`, 'netlify/edge-functions/hand.ts']);
  });
});
