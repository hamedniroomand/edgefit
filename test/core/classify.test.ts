import { describe, expect, it } from 'vite-plus/test';

import { classify } from '@/core/classify.ts';
import { collectSupported } from '@/core/findings.ts';
import type { ApiRef, Usage } from '@/types.ts';
import { makeUsage, stubTarget } from '~/helpers.ts';

const watch = { module: 'fs', path: ['watch'] };
const target = stubTarget(
  {
    'fs.watch': { status: 'unsupported', note: 'does not exist on the target', source: 'src-url' },
    'fs.cp': { status: 'mismatch' },
    'fs.glob': { status: 'uncovered' },
    'crypto.subtle': { status: 'unsupported', category: 'web' },
    '*globals*.require.(dynamic)': { status: 'unsupported', note: 'is not allowed' },
  },
  ['os'],
);

describe('classifying API usages', () => {
  it('leaves supported APIs unreported', () => {
    expect(classify(makeUsage({ module: 'fs', path: ['readFile'] }), target)).toBeUndefined();
  });

  it('maps the status to a category with the note as detail', () => {
    expect(classify(makeUsage(watch), target)).toEqual({
      category: 'unsupported',
      detail: 'does not exist on the target',
      source: 'src-url',
      absent: false,
    });
  });

  it('falls back to the status when there is no note', () => {
    expect(classify(makeUsage({ module: 'fs', path: ['cp'] }), target)).toMatchObject({
      category: 'mismatch',
      detail: 'is mismatch on the target',
    });
  });

  it('reports uncovered APIs as unknown', () => {
    expect(classify(makeUsage({ module: 'fs', path: ['glob'] }), target)).toMatchObject({
      category: 'unknown',
      detail: 'is not covered by the compatibility data',
    });
  });

  it('prefers the category set by the data', () => {
    expect(classify(makeUsage({ module: 'crypto', path: ['subtle'] }), target)?.category).toBe(
      'web',
    );
  });
});

describe('classifying dynamic usages', () => {
  const dynamic = (api?: ApiRef): Usage =>
    makeUsage(api, { kind: 'dynamic', reason: 'the argument is not a literal' });

  it('reports a dynamic access with no known API as unknown', () => {
    expect(classify(dynamic(), target)).toEqual({
      category: 'unknown',
      detail: 'cannot be checked statically: the argument is not a literal',
      source: undefined,
      absent: false,
    });
  });

  it('reports a dynamic access below an API that hides problems', () => {
    expect(classify(dynamic({ module: 'os', path: [] }), target)?.category).toBe('unknown');
  });

  it('skips one that cannot reach an unsupported API', () => {
    expect(classify(dynamic({ module: 'path', path: [] }), target)).toBeUndefined();
  });

  it('skips one whose starting API is already reported', () => {
    expect(classify(dynamic(watch), target)).toBeUndefined();
  });

  it('reports a call-shaped leaf as its own finding when the target blocks it', () => {
    const usage = dynamic({ module: '*globals*', path: ['require', '(dynamic)'] });
    expect(classify(usage, target)).toMatchObject({
      category: 'unsupported',
      detail: 'is not allowed',
    });
  });

  it('keeps a call-shaped leaf the target allows as unknown', () => {
    const usage = dynamic({ module: '*globals*', path: ['other', '(dynamic)'] });
    expect(classify(usage, target)?.category).toBe('unknown');
  });

  it('uses a generic reason when none is given', () => {
    const usage = makeUsage(undefined, { kind: 'dynamic' });
    expect(classify(usage, target)?.detail).toBe(
      'cannot be checked statically: it cannot be analyzed statically',
    );
  });
});

describe('an API that fails only for some options', () => {
  const connect = { module: 'tls', path: ['connect'] };
  const options = stubTarget({
    'tls.connect': {
      status: 'mismatch',
      note: 'throws for some options',
      options: ['ALPNProtocols', { key: 'rejectUnauthorized', value: false }],
    },
  });
  const categoryOf = (passedKeys?: Usage['passedKeys']): string | undefined =>
    classify(makeUsage(connect, passedKeys === undefined ? {} : { passedKeys }), options)?.category;

  it('reports a call that passes a key that fails', () => {
    expect(categoryOf([{ key: 'host', value: 'a' }, { key: 'ALPNProtocols' }])).toBe('mismatch');
  });

  it('reports a call that passes the value that fails', () => {
    expect(categoryOf([{ key: 'rejectUnauthorized', value: false }])).toBe('mismatch');
  });

  it.each([
    ['no known keys', undefined],
    ['other keys', [{ key: 'host' }]],
    ['another value', [{ key: 'rejectUnauthorized', value: true }]],
    ['a value that is not known', [{ key: 'rejectUnauthorized' }]],
  ])('does not report a call with %s', (_name, passedKeys) => {
    expect(categoryOf(passedKeys)).toBeUndefined();
  });
});

describe('a usage that counts only for options', () => {
  const mixed = stubTarget({
    'fs.watch': { status: 'unsupported', note: 'missing' },
    'tls.connect': {
      status: 'mismatch',
      note: 'throws',
      options: [{ key: 'checkServerIdentity', gate: { flag: 'f', date: '2026-01-01' } }],
    },
  });
  const call = (api: ApiRef, key: string): Usage =>
    makeUsage(api, { onlyForOptions: true, passedKeys: [{ key }] });
  const connect = { module: 'tls', path: ['connect'] };

  it('gives no finding for an API without options, so its other usages decide', () => {
    expect(classify(call(watch, 'recursive'), mixed)).toBeUndefined();
  });

  it('matches an item with a key and no value by the key alone', () => {
    expect(classify(call(connect, 'checkServerIdentity'), mixed)?.category).toBe('mismatch');
  });

  it('lists neither the call nor an API with options as supported', () => {
    const modules = [
      {
        file: 'a.js',
        package: undefined,
        chain: [],
        usages: [makeUsage(connect), call(watch, 'recursive'), call(connect, 'host')],
      },
    ];
    expect(collectSupported(modules, mixed)).toEqual([]);
  });
});
