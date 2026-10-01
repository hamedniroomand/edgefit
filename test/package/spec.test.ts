import { describe, expect, it } from 'vite-plus/test';

import { EdgefitError } from '@/errors.ts';
import { installSpec, parsePackageSpec } from '@/package/spec.ts';

describe('parsePackageSpec', () => {
  it.each([
    ['hono', 'hono', undefined],
    ['hono@4.1.0', 'hono', '4.1.0'],
    ['hono@^4', 'hono', '^4'],
    ['@scope/name', '@scope/name', undefined],
    ['@scope/name@1.2.3', '@scope/name', '1.2.3'],
    ['@scope/name@next', '@scope/name', 'next'],
  ])('splits %s', (spec, name, selector) => {
    expect(parsePackageSpec(spec)).toEqual({ kind: 'registry', name, selector });
  });

  it.each(['.', './pkg', '../pkg', '/abs/pkg', 'x.tgz', './x.tar.gz'])(
    'reads %s as local',
    spec => {
      expect(parsePackageSpec(spec)).toEqual({ kind: 'local', path: spec });
    },
  );

  it.each(['', '@scope', 'Bad Name', 'name@', '@/x'])('rejects %j', spec => {
    expect(() => parsePackageSpec(spec)).toThrow(EdgefitError);
  });

  it('builds the npm install argument', () => {
    expect(installSpec(parsePackageSpec('@scope/name@^1'))).toBe('@scope/name@^1');
    expect(installSpec(parsePackageSpec('name'))).toBe('name');
    expect(installSpec(parsePackageSpec('./x.tgz'))).toBe('./x.tgz');
  });
});
