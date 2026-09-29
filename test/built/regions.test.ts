import { describe, expect, it } from 'vite-plus/test';

import { parseRegions } from '@/built/regions.ts';

const chunk = [
  '//#region node_modules/jose/dist/a.js',
  'function a() {}',
  '//#endregion',
  '//#region #nitro/virtual/tasks',
  'const tasks = {};',
  '//#endregion',
  '//#region server/routes/index.ts',
  'const lock = () => a();',
  '//#endregion',
  'export { lock };',
].join('\n');

describe('reading region markers', () => {
  it('names the file each line came from', () => {
    const regions = parseRegions(chunk);
    expect(regions.fileAt(2)).toBe('node_modules/jose/dist/a.js');
    expect(regions.fileAt(8)).toBe('server/routes/index.ts');
  });

  it('includes the marker lines and stops at the end marker', () => {
    const regions = parseRegions(chunk);
    expect(regions.fileAt(1)).toBe('node_modules/jose/dist/a.js');
    expect(regions.fileAt(3)).toBe('node_modules/jose/dist/a.js');
    expect(regions.fileAt(10)).toBeUndefined();
  });

  it('leaves virtual modules unattributed', () => {
    expect(parseRegions(chunk).fileAt(5)).toBeUndefined();
  });

  it('has no regions without markers, and copes with an unterminated one', () => {
    expect(parseRegions('const a = 1;\nconst b = 2;').fileAt(1)).toBeUndefined();
    expect(parseRegions('//#region lib/a.js\nconst a = 1;').fileAt(2)).toBe('lib/a.js');
  });
});
