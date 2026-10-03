import { describe, expect, it } from 'vite-plus/test';

import { extractUsages } from '@/extract/index.ts';

const options = { globals: new Set(['process', 'crypto']), nodeEnv: 'production' } as const;
const fs = "import fs from 'node:fs';\nimport * as fsp from 'node:fs/promises';\n";
const caught = (source: string): string[] =>
  extractUsages('src/a.ts', fs + source, options)
    .filter(usage => usage.caught === true)
    .map(usage => usage.display);

describe('a use that a try block with a catch stops', () => {
  it('is marked caught', () => {
    expect(caught("try {\n  fs.watch('.');\n} catch {}")).toEqual(['node:fs.watch']);
    expect(caught("try {\n  process.binding('buffer');\n} catch {}")).toEqual([
      'node:process.binding',
    ]);
  });

  it('is marked caught when a promise is awaited', () => {
    expect(caught("try {\n  await fsp.readFile('a');\n} catch {}")).toEqual([
      'node:fs/promises.readFile',
    ]);
  });

  it('is caught when an awaited call is optional or wrapped', () => {
    expect(caught("try {\n  await fsp?.readFile('a');\n} catch {}")).toEqual([
      'node:fs/promises.readFile',
    ]);
    expect(caught("try {\n  await (fsp.readFile as any)('a');\n} catch {}")).toEqual([
      'node:fs/promises.readFile',
    ]);
  });

  it('is not caught when a promise is not awaited', () => {
    expect(caught("try {\n  fsp.readFile('a');\n} catch {}")).toEqual([]);
    expect(caught("try {\n  fs.promises.readFile('a');\n} catch {}")).toEqual([]);
  });

  it('treats crypto.subtle as a promise API', () => {
    expect(caught("try {\n  crypto.subtle.digest('SHA-1', d);\n} catch {}")).toEqual([]);
    expect(caught("try {\n  await crypto.subtle.digest('SHA-1', d);\n} catch {}")).toEqual([
      'crypto.subtle.digest',
    ]);
  });

  it('is not caught when the catch throws again or there is none', () => {
    expect(caught("try {\n  fs.watch('.');\n} catch (e) {\n  throw e;\n}")).toEqual([]);
    expect(caught("try {\n  fs.watch('.');\n} finally {}")).toEqual([]);
  });

  it('is caught inside a check, and not caught by the check alone', () => {
    expect(caught("if (fs.watch) {\n  try {\n    fs.watch('.');\n  } catch {}\n}")).toEqual([
      'node:fs.watch',
    ]);
    expect(caught("if (fs.watch) {\n  fs.watch('.');\n}")).toEqual([]);
  });
});
