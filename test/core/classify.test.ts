import { describe, expect, it } from 'vite-plus/test';

import { classify } from '@/core/classify.ts';
import type { ApiRef, Usage } from '@/types.ts';
import { makeUsage, stubTarget } from '~/helpers.ts';

const watch = { module: 'fs', path: ['watch'] };
const target = stubTarget(
  {
    'fs.watch': { status: 'unsupported', note: 'does not exist on the target', source: 'src-url' },
    'fs.cp': { status: 'mismatch' },
    'fs.glob': { status: 'uncovered' },
    'crypto.subtle': { status: 'unsupported', category: 'web' },
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

  it('uses a generic reason when none is given', () => {
    const usage = makeUsage(undefined, { kind: 'dynamic' });
    expect(classify(usage, target)?.detail).toBe(
      'cannot be checked statically: it cannot be analyzed statically',
    );
  });
});
