import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

describe('resolving constant module specifiers', () => {
  it('treats a const string like a literal specifier', () => {
    const source = "const name = 'node:v8';\nconst v8 = await import(name);\nv8.serialize(1);";
    expect(usagesOf(source)).toEqual(['api node:v8', 'api node:v8.serialize']);
  });

  it('accepts a template literal without expressions', () => {
    expect(usagesOf('const name = `vm`;\nawait import(name);')).toEqual(['api node:vm']);
  });

  it('applies to require as well', () => {
    expect(usagesOf("const name = 'fs';\nrequire(name).watch('.');")).toEqual([
      'api node:fs.watch',
    ]);
  });

  it('finds the constant in an enclosing scope', () => {
    const source =
      "const name = 'cloudflare:workers';\nasync function load() {\n  try {\n    return await import(name);\n  } catch {\n    return undefined;\n  }\n}";
    expect(usagesOf(source)).toEqual([]);
  });
});

describe('leaving non-constant specifiers alone', () => {
  it('keeps reporting a let, a var and a parameter', () => {
    expect(usagesOf("let name = 'fs';\nawait import(name);")).toEqual([
      'dynamic import(<expression>)',
    ]);
    expect(usagesOf("var name = 'fs';\nawait import(name);")).toEqual([
      'dynamic import(<expression>)',
    ]);
    expect(usagesOf('function load(name) {\n  return import(name);\n}')).toEqual([
      'dynamic import(<expression>)',
    ]);
  });

  it('keeps reporting a name shadowed by a non-constant', () => {
    const source =
      "const name = 'fs';\nfunction load(name) {\n  return import(name);\n}\nfunction other() {\n  let name = 'vm';\n  return import(name);\n}";
    expect(usagesOf(source)).toEqual([
      'dynamic import(<expression>)',
      'dynamic import(<expression>)',
    ]);
  });

  it('keeps reporting a constant that is not a plain string', () => {
    expect(usagesOf("const name = 'f' + 's';\nawait import(name);")).toEqual([
      'dynamic import(<expression>)',
    ]);
    expect(usagesOf('const name = `f${s}`;\nawait import(name);')).toEqual([
      'dynamic import(<expression>)',
    ]);
  });
});
