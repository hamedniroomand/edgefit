import { parseSync } from 'oxc-parser';
import type { Node } from 'oxc-parser';
import { describe, expect, it } from 'vite-plus/test';

import { collectChecks } from '@/extract/checks.ts';
import { createScope } from '@/extract/scope.ts';

describe('the region of a var that holds a check', () => {
  it('is the block when no scope gives the body of a function or file', () => {
    const { body } = parseSync('input.js', "var a = typeof Deno !== 'undefined';").program;
    const scope = createScope();
    collectChecks(body as Node[], scope);
    expect(scope.checks.get('a')?.region).toEqual([body, body]);
  });
});
