import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const bytes = 'api WebAssembly.instantiate(bytes)';

describe('WebAssembly.instantiate with a source that is not an imported module', () => {
  it('records bytes, a fetch result and a parameter', () => {
    expect(usagesOf('WebAssembly.instantiate(new Uint8Array([0, 97, 115, 109]));')).toContain(
      bytes,
    );
    expect(
      usagesOf('WebAssembly.instantiate(await fetch(url).then(r => r.arrayBuffer()));'),
    ).toContain(bytes);
    expect(usagesOf('export const load = source => WebAssembly.instantiate(source);')).toContain(
      bytes,
    );
  });

  it('records it through the global object and with an import object', () => {
    expect(usagesOf('globalThis.WebAssembly.instantiate(data, imports);')).toContain(bytes);
  });

  it('records an import that is not a wasm file', () => {
    expect(usagesOf("import data from './x.bin'; WebAssembly.instantiate(data);")).toContain(bytes);
  });

  it('leaves alone a module from a wasm import', () => {
    const wasm = usagesOf("import wasm from './x.wasm?module'; WebAssembly.instantiate(wasm);");
    expect(wasm).not.toContain(bytes);
    expect(
      usagesOf("import * as wasm from './x.wasm'; WebAssembly.instantiate(wasm, {});"),
    ).not.toContain(bytes);
    expect(
      usagesOf("import wasm from './x.wasm'; WebAssembly.instantiate(wasm as never);"),
    ).not.toContain(bytes);
  });

  it('records a wasm import that a nearer name shadows', () => {
    const shadowed =
      "import wasm from './x.wasm'; export const run = wasm => WebAssembly.instantiate(wasm);";
    expect(usagesOf(shadowed)).toContain(bytes);
  });

  it('leaves alone a call without a source and other calls', () => {
    expect(usagesOf('WebAssembly.instantiate();')).not.toContain(bytes);
    expect(usagesOf('const WebAssembly = {}; WebAssembly.instantiate(x);')).not.toContain(bytes);
    expect(usagesOf('other.instantiate(x);')).not.toContain(bytes);
    expect(usagesOf('WebAssembly.validate(x);')).not.toContain(bytes);
  });
});
