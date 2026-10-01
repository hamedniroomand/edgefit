import type { Message } from 'esbuild';
import { describe, expect, it } from 'vite-plus/test';

import { toResolveError } from '@/resolve/errors.ts';

const message = (text: string, located = false): Message =>
  ({
    text,
    location: located ? { file: 'a.ts', line: 3, column: 1 } : null,
  }) as Message;

describe('toResolveError', () => {
  it('shows file locations and caps the message list', () => {
    const error = toResolveError([
      message('x', true),
      ...Array.from({ length: 5 }, () => message('y')),
    ]);
    expect(error.message).toContain('a.ts:3:2: x');
    expect(error.message).toContain('...and 1 more');
  });

  it('hints at framework virtual modules and missing installs', () => {
    expect(toResolveError([message('Could not resolve "#imports"')]).hint).toContain('virtual');
    expect(toResolveError([message('Could not resolve "foo"')]).hint).toContain('Install');
    expect(toResolveError([message('other')]).hint).toBeUndefined();
  });
});
