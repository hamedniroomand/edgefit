import { describe, expect, it } from 'vite-plus/test';

import { classify } from '@/core/classify.ts';
import { CompatIndex } from '@/data/compat-index.ts';
import type { CompatEntry } from '@/data/providers/provider.ts';
import { extractUsages } from '@/extract/index.ts';
import type { Target } from '@/targets/index.ts';
import { stubTarget } from '~/helpers.ts';

const tree = {
  '*self*': 'object',
  on: 'function',
  EventEmitter: { '*self*': 'class', prototype: { emit: 'function' } },
};
const source = { provider: 'test', version: '1' };

function entry(path: string[], fields: Partial<CompatEntry>): CompatEntry {
  return { target: 'workerd', module: 'events', path, status: 'mismatch', source, ...fields };
}

function targetWith(entries: CompatEntry[]): Target {
  const index = new CompatIndex(
    { baseline: { events: tree }, runtime: { events: tree }, source },
    entries,
  );
  return {
    ...stubTarget(),
    lookup: api => index.lookup(api),
    hasProblemsBelow: api => index.hasProblemsBelow(api),
  };
}

function details(code: string, target: Target): (string | undefined)[] {
  return extractUsages('src/input.ts', code, { globals: new Set(), nodeEnv: 'production' })
    .map(usage => classify(usage, target)?.detail)
    .filter(detail => detail !== undefined);
}

const computed = 'cannot be checked statically: accessed with a computed property';
const readOfModule = "import ev from 'events';\nexport function get(key) { return ev[key]; }";
const readOfClass =
  "import ev from 'events';\nexport function get(key) { return ev.EventEmitter[key]; }";

describe('a dynamic read above an API that fails only for some options', () => {
  it('gives no unknown finding when the module has no other problem', () => {
    const target = targetWith([entry(['on'], { options: ['signal'] })]);
    expect(details(readOfModule, target)).toEqual([]);
  });

  it('gives an unknown finding for the same entry without options', () => {
    const target = targetWith([entry(['on'], {})]);
    expect(details(readOfModule, target)).toEqual([computed]);
  });

  it('gives an unknown finding when a member below the options entry is unsupported', () => {
    const target = targetWith([
      entry(['EventEmitter'], { options: ['captureRejections'] }),
      entry(['EventEmitter', 'prototype', 'emit'], { status: 'unsupported' }),
    ]);
    expect(details(readOfClass, target)).toEqual([computed]);
  });

  it('keeps no finding for a read of the options entry with nothing below it', () => {
    const target = targetWith([entry(['EventEmitter'], { options: ['captureRejections'] })]);
    expect(details(readOfClass, target)).toEqual([]);
  });
});
