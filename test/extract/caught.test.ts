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

describe('a function outside a promises path that gives a promise', () => {
  // A module from a wasm import is not bytes, so only the plain call is recorded.
  const caughtGlobal = (source: string): string[] =>
    extractUsages('src/a.ts', `import wasm from './x.wasm';\n${source}`, {
      ...options,
      globals: new Set(['WebAssembly', 'fetch']),
    })
      .filter(usage => usage.caught === true)
      .map(usage => usage.display);

  it.each([
    ['WebAssembly.compile', 'WebAssembly.compile(bytes)'],
    ['WebAssembly.compileStreaming', 'WebAssembly.compileStreaming(response)'],
    ['WebAssembly.instantiate', 'WebAssembly.instantiate(wasm)'],
    ['WebAssembly.instantiateStreaming', 'WebAssembly.instantiateStreaming(response)'],
    ['fetch', 'fetch(url)'],
  ])('is not caught when %s is not awaited, and is caught when it is', (api, call) => {
    expect(caughtGlobal(`try {\n  return ${call};\n} catch {\n  return null;\n}`)).toEqual([]);
    expect(caughtGlobal(`try {\n  return await ${call};\n} catch {\n  return null;\n}`)).toEqual([
      api,
    ]);
  });

  it('reads the Node.js functions fs.openAsBlob and events.once the same way', () => {
    const source =
      "import events from 'node:events';\ntry {\n  fs.openAsBlob(p);\n  events.once(e, 'x');\n} catch {}";
    expect(caught(source)).toEqual([]);
    expect(caught(source.replace('fs.openAsBlob', 'await fs.openAsBlob'))).toEqual([
      'node:fs.openAsBlob',
    ]);
  });

  it('keeps a method with the same name on another module sync', () => {
    expect(caught("try {\n  process.once('exit', stop);\n} catch {}")).toEqual([
      'node:process.once',
    ]);
  });
});
