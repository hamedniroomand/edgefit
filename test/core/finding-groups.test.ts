import { describe, expect, it } from 'vite-plus/test';

import { group } from '@/core/finding-groups.ts';
import type { Finding, Location } from '@/types.ts';
import { makeFinding } from '~/helpers.ts';

const at = (file: string, line: number): Location => ({ file, line, column: 1 });
const pkg = { name: 'pkg', version: '1.0.0' };

describe('grouping findings', () => {
  it('lists each other location once, when several uses map to one place', () => {
    const watch = (location: Location): Finding =>
      makeFinding('node:fs.watch', { location, package: pkg });
    const [finding, ...rest] = group([
      watch(at('a.js', 1)),
      watch(at('b.js', 7)),
      watch(at('b.js', 7)),
      watch(at('a.js', 1)),
    ]);
    expect(rest).toEqual([]);
    expect(finding?.location).toEqual(at('a.js', 1));
    expect(finding?.otherLocations).toEqual([at('b.js', 7)]);
  });

  it('keeps a place in another column apart', () => {
    const [finding] = group([
      makeFinding('node:fs.watch', { location: at('a.js', 1), package: pkg }),
      makeFinding('node:fs.watch', {
        location: { file: 'a.js', line: 1, column: 9 },
        package: pkg,
      }),
    ]);
    expect(finding?.otherLocations).toEqual([{ file: 'a.js', line: 1, column: 9 }]);
  });
});
