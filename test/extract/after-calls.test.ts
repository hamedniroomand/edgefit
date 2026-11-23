import { describe, expect, it } from 'vite-plus/test';

import { extractUsages } from '@/extract/index.ts';

const options = { globals: new Set(['process']), nodeEnv: 'production' } as const;
const imports = "import * as mod from 'node:module';\nimport fs from 'node:fs';\n";

/** Each usage as `display` or `display after <calls>`. */
const afterCalls = (source: string): string[] =>
  extractUsages('src/a.ts', imports + source, options)
    .filter(usage => usage.api !== undefined && usage.api.path.length > 0)
    .map(usage =>
      usage.afterCalls === undefined
        ? usage.display
        : `${usage.display} after ${usage.afterCalls.map(ref => `${ref.module}.${ref.path.join('.')}`).join(', ')}`,
    );

describe('code after a call in a try block whose catch stops the error', () => {
  it('runs only after the call returned', () => {
    expect(afterCalls('try {\n  mod.registerHooks({});\n  fs.watch(".");\n} catch {}')).toEqual([
      'node:module.registerHooks',
      'node:fs.watch after module.registerHooks',
    ]);
  });

  it('holds for an awaited call and for a call that a declaration stores', () => {
    expect(
      afterCalls('try {\n  await mod.registerHooks({});\n  fs.watch(".");\n} catch {}'),
    ).toContain('node:fs.watch after module.registerHooks');
    expect(
      afterCalls('try {\n  const hooks = mod.registerHooks({});\n  fs.watch(".");\n} catch {}'),
    ).toContain('node:fs.watch after module.registerHooks');
  });

  it('covers a function that the code after the call creates', () => {
    const source = [
      'try {',
      '  mod.registerHooks({});',
      '  const compile = mod.Module.prototype._compile;',
      '  mod.Module.prototype._compile = function (content) {',
      '    return compile.call(this, content);',
      '  };',
      '} catch {',
      '  return;',
      '}',
    ].join('\n');
    expect(afterCalls(`function register() {\n${source}\n}`)).toContain(
      'node:module.Module.prototype._compile after module.registerHooks',
    );
  });
});

describe('code that a call in a try block does not decide', () => {
  it('ends at the end of the block of the call', () => {
    const source =
      'try {\n  if (ok) {\n    mod.registerHooks({});\n  }\n  fs.watch(".");\n} catch {}';
    expect(afterCalls(source)).toContain('node:fs.watch');
  });

  it('does not hold before the call', () => {
    expect(afterCalls('try {\n  fs.watch(".");\n  mod.registerHooks({});\n} catch {}')).toContain(
      'node:fs.watch',
    );
  });

  it('does not hold for a call that an optional chain or a condition can skip', () => {
    expect(afterCalls('try {\n  mod.registerHooks?.({});\n  fs.watch(".");\n} catch {}')).toContain(
      'node:fs.watch',
    );
    expect(
      afterCalls('try {\n  ok && mod.registerHooks({});\n  fs.watch(".");\n} catch {}'),
    ).toContain('node:fs.watch');
    expect(afterCalls('try {\n  mod?.registerHooks({});\n  fs.watch(".");\n} catch {}')).toContain(
      'node:fs.watch',
    );
    expect(
      afterCalls('try {\n  mod?.Module.prototype._compile();\n  fs.watch(".");\n} catch {}'),
    ).toContain('node:fs.watch');
  });

  it('does not hold without a catch that stops the error, or after the try', () => {
    expect(afterCalls('mod.registerHooks({});\nfs.watch(".");')).toContain('node:fs.watch');
    expect(
      afterCalls('try {\n  mod.registerHooks({});\n} catch (e) {\n  throw e;\n}\nfs.watch(".");'),
    ).toContain('node:fs.watch');
    expect(afterCalls('try {\n  mod.registerHooks({});\n} catch {}\nfs.watch(".");')).toContain(
      'node:fs.watch',
    );
  });

  it('does not hold inside a function that the try block only defines', () => {
    const source =
      'try {\n  const run = () => {\n    mod.registerHooks({});\n  };\n  fs.watch(".");\n} catch {}';
    expect(afterCalls(source)).toContain('node:fs.watch');
  });
});

describe('code after a call that a target can skip or postpone', () => {
  it('does not hold inside a function declaration, which is hoisted', () => {
    const source =
      'try {\n  mod.registerHooks({});\n  function f() {\n    fs.watch(".");\n  }\n} catch {}\nf();';
    expect(afterCalls(source)).toContain('node:fs.watch');
  });

  it('does not hold after a promise API that nothing awaits, which rejects later', () => {
    const source =
      "import * as fsp from 'node:fs/promises';\ntry {\n  fsp.watch('.');\n  fs.watch('.');\n} catch {}";
    expect(afterCalls(source)).toContain('node:fs.watch');
  });

  it('holds after a promise API that the statement awaits', () => {
    const source =
      "import * as fsp from 'node:fs/promises';\ntry {\n  await fsp.watch('.');\n  fs.watch('.');\n} catch {}";
    expect(afterCalls(source)).toContain('node:fs.watch after fs/promises.watch');
  });

  it('does not hold after bind, which calls nothing', () => {
    expect(
      afterCalls('try {\n  mod.registerHooks.bind(mod);\n  fs.watch(".");\n} catch {}'),
    ).toContain('node:fs.watch');
  });
});

describe('the API that a call through call or apply makes', () => {
  it('is the function itself', () => {
    expect(
      afterCalls('try {\n  mod.registerHooks.call(mod, {});\n  fs.watch(".");\n} catch {}'),
    ).toContain('node:fs.watch after module.registerHooks');
  });

  it('holds after the try when the catch jumps, since the code is reached only when the call returned', () => {
    const source =
      'function g() {\n  try {\n    mod.registerHooks({});\n  } catch {\n    return;\n  }\n  fs.watch(".");\n}';
    expect(afterCalls(source)).toContain('node:fs.watch after module.registerHooks');
  });
});
