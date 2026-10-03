import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

describe('a write to a member', () => {
  it.each(['=', '??=', '||='])('reads the object of `%s`, not the member', operator => {
    expect(usagesOf(`process.report.excludeNetwork ${operator} true;`)).toEqual([
      'api node:process.report',
    ]);
  });

  it('reads the object of a member of a missing object', () => {
    expect(usagesOf('process.missing.value = true;')).toEqual(['api node:process.missing']);
  });

  it('reads a member that is only written to in a compound operator', () => {
    expect(usagesOf('process.report.count += 1;')).toEqual(['api node:process.report.count']);
  });

  it('reads a member on the left of a comparison', () => {
    expect(usagesOf('const x = process.report.count === 1;')).toEqual([
      'api node:process.report.count',
    ]);
  });

  it('records nothing for a member of globalThis', () => {
    expect(usagesOf('globalThis.flag = true;')).toEqual([]);
  });

  it('reads the object through an alias', () => {
    expect(usagesOf('const r = process.report; r.excludeNetwork = true;')).toEqual([
      'api node:process.report',
      'api node:process.report',
    ]);
  });

  it('does not pass a written namespace member on as a value', () => {
    expect(usagesOf("import * as fs from 'node:fs'; fs.x = 1;")).toEqual(['api node:fs']);
  });
});
