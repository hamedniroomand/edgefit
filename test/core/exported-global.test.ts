import { describe, expect, it } from 'vite-plus/test';

import { classify } from '@/core/classify.ts';
import type { Classification } from '@/core/classify.ts';
import { extractUsages } from '@/extract/index.ts';
import type { ApiRef } from '@/types.ts';
import { makeUsage, stubTarget } from '~/helpers.ts';

const target = stubTarget({}, ['*globals*.URL', '*globals*.crypto.subtle', 'crypto']);
const dynamic = (api: ApiRef, exported: boolean): Classification | undefined =>
  classify(
    makeUsage(api, { kind: 'dynamic', reason: 'exported', ...(exported ? { exported } : {}) }),
    target,
  );
const exported = (api: ApiRef): Classification | undefined => dynamic(api, true);
const global = (...path: string[]): ApiRef => ({ module: '*globals*', path });

describe('an export of a name bound to a global', () => {
  it('is not reported for a global that the target has', () => {
    expect(exported(global('URL'))).toBeUndefined();
    expect(exported(global('crypto', 'subtle'))).toBeUndefined();
  });

  it('is reported when it is not an export', () => {
    expect(dynamic(global('URL'), false)?.category).toBe('unknown');
  });

  it('is reported for a module', () => {
    expect(exported({ module: 'crypto', path: [] })?.category).toBe('unknown');
  });

  it('is marked by the extraction', () => {
    const usages = extractUsages('src/a.ts', 'const FastURL = URL;\nexport { FastURL };', {
      globals: new Set(['URL']),
      nodeEnv: 'production',
    });
    expect(usages.filter(usage => usage.exported === true)).toHaveLength(1);
  });
});
