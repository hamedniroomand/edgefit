import { describe, expect, it } from 'vite-plus/test';

import { extractUsages } from '@/extract/index.ts';

const run = (source: string, imported = true): string[] =>
  extractUsages('lib.cjs', source, {
    globals: new Set(['process']),
    nodeEnv: undefined,
    imported,
  }).map(usage => usage.display);
const cli = "const cp = require('node:child_process');\n";
const helper =
  'const commonJS = (init, cache) => () => (init((cache = { exports: {} }).exports, cache), cache.exports);\n';

describe('main guards in imported modules', () => {
  it.each(['===', '=='])('reads equality %s in either order', operator => {
    expect(run(`${cli}if (require.main ${operator} module) cp.spawn('cmd');`)).not.toContain(
      'node:child_process.spawn',
    );
    expect(run(`${cli}module ${operator} require.main && cp.spawn('cmd');`)).not.toContain(
      'node:child_process.spawn',
    );
  });

  it('keeps the opposite branch and reads helpers', () => {
    expect(run(`${cli}require.main !== module && cp.spawn('cmd');`)).toContain(
      'node:child_process.spawn',
    );
    expect(run(`${cli}require.main === module || cp.spawn('cmd');`)).toContain(
      'node:child_process.spawn',
    );
    expect(
      run(`${cli}const main = () => module === require.main; if (main()) cp.spawn('cmd');`),
    ).not.toContain('node:child_process.spawn');
  });

  it.each([
    "function f(module) { require.main === module && cp.spawn('cmd'); }",
    "function f(require) { require.main === module && cp.spawn('cmd'); }",
    "require.main === other && cp.spawn('cmd');",
    "require.other === module && cp.spawn('cmd');",
    "require.main > module && cp.spawn('cmd');",
  ])('keeps a check it cannot decide: %s', source => {
    expect(run(`${cli}${source}`)).toContain('node:child_process.spawn');
  });

  it('keeps both branches for an entry', () => {
    expect(run(`${cli}require.main === module && cp.spawn('cmd');`, false)).toContain(
      'node:child_process.spawn',
    );
  });
});

describe('functions called behind a main guard', () => {
  const fn = "function command() { cp.spawn('cmd'); }\n";

  it('leaves out the function and its helper', () => {
    expect(
      run(`${cli}${fn}function run() { command(); } require.main === module && run();`),
    ).not.toContain('node:child_process.spawn');
  });

  it.each([
    'command();',
    'module.exports = command;',
    'use(command);',
    'function other() { command(); }',
    'const result = command();',
    'export { command };',
    "eval('command()');",
  ])('keeps a function that can run elsewhere: %s', source => {
    expect(run(`${cli}${fn}${source} require.main === module && command();`)).toContain(
      'node:child_process.spawn',
    );
  });

  it('keeps functions when local names are repeated', () => {
    expect(
      run(
        `${cli}${fn}function other(command) { command(); } require.main === module && command();`,
      ),
    ).toContain('node:child_process.spawn');
  });
});

describe('main-only bindings and call cycles', () => {
  it('keeps a function called while its CLI result is made', () => {
    expect(
      run(
        `${cli}function command() { cp.spawn('cmd'); } const result = enabled && command(); require.main === module && use(result);`,
      ),
    ).toContain('node:child_process.spawn');
  });

  it('leaves out function expressions and a recursive CLI helper', () => {
    expect(
      run(
        `${cli}const command = () => { cp.spawn('cmd'); command(); }; require.main === module && command();`,
      ),
    ).not.toContain('node:child_process.spawn');
  });

  it('leaves out a destructured CLI binding', () => {
    expect(
      run(
        "const { spawn } = require('node:child_process'); function command() { spawn('cmd'); } require.main === module && command();",
      ),
    ).not.toContain('node:child_process.spawn');
  });

  it('keeps a binding used by a live export', () => {
    expect(
      run(
        `${cli}function command() { cp.spawn('cmd'); } module.exports = { cp }; require.main === module && command();`,
      ),
    ).toContain('node:child_process');
  });

  it('keeps a reassigned function', () => {
    expect(
      run(
        `${cli}function command() { cp.spawn('cmd'); } command = other; require.main === module && command();`,
      ),
    ).toContain('node:child_process.spawn');
  });
});

describe('module load effects next to CLI code', () => {
  it('keeps an eager call in a factory', () => {
    expect(
      run(
        `${cli}${helper}const factory = commonJS((exports, module) => { function command() { cp.spawn('cmd'); } command(); module.exports = command; }); const run = factory(); require.main === module && run();`,
      ),
    ).toContain('node:child_process.spawn');
  });

  it('keeps a call under a different factory check', () => {
    expect(
      run(
        `${cli}${helper}const factory = commonJS((exports, module) => { function command() { cp.spawn('cmd'); } enabled && command(); module.exports = command; }); const run = factory(); require.main === module && run();`,
      ),
    ).toContain('node:child_process.spawn');
  });

  it('keeps computed require arguments', () => {
    expect(
      run(
        `${cli}function command() { cp.spawn('cmd'); } const result = require(command()); require.main === module && use(result);`,
      ),
    ).toContain('node:child_process.spawn');
  });
});

describe('export declarations next to a main guard', () => {
  it.each([
    "export function command() { cp.spawn('cmd'); }",
    "export const command = () => cp.spawn('cmd');",
  ])('keeps an exported declaration: %s', declaration => {
    expect(run(`${cli}${declaration} require.main === module && command();`)).toContain(
      'node:child_process.spawn',
    );
  });

  it('keeps a native import that runs during module load', () => {
    const usages = extractUsages(
      'lib.cjs',
      "const addon = require('./addon.node'); function command() { addon(); } require.main === module && command();",
      {
        globals: new Set(),
        nodeEnv: undefined,
        imported: true,
        nativeSpecifiers: new Map([['./addon.node', 'addon']]),
      },
    );
    expect(usages.some(usage => usage.kind === 'native')).toBe(true);
  });
});

describe('main checks inside a CommonJS factory', () => {
  it.each(['require.main === module', 'module == require["main"]'])(
    'leaves out the factory CLI: %s',
    check => {
      expect(
        run(
          `${cli}${helper}const factory = commonJS((exports, module) => { function command() { cp.spawn('cmd'); } module.exports = command; ${check} && command(); }); const run = factory(); require.main === module && run();`,
        ),
      ).not.toContain('node:child_process.spawn');
    },
  );

  it('keeps a factory call checked against another module', () => {
    expect(
      run(
        `${cli}${helper}const factory = commonJS((exports, module) => { function command() { cp.spawn('cmd'); } module.exports = command; require.main === other && command(); }); const run = factory(); require.main === module && run();`,
      ),
    ).toContain('node:child_process.spawn');
  });

  it('keeps a callback that does not write CommonJS exports', () => {
    expect(
      run(
        `${cli}const factory = callback((first, second) => { function command() { cp.spawn('cmd'); } require.main === second && command(); return command; }); const run = factory(); require.main === module && run();`,
      ),
    ).toContain('node:child_process.spawn');
  });
  it('keeps a callback with a destructured second parameter', () => {
    expect(
      run(
        `${cli}const factory = callback((first, { value }) => { function command() { cp.spawn('cmd'); } value && command(); return command; }); const run = factory(); require.main === module && run();`,
      ),
    ).toContain('node:child_process.spawn');
  });
});

describe('code written inline behind a factory check', () => {
  it('leaves out a call written inline behind the factory check', () => {
    expect(
      run(
        `${cli}${helper}const factory = commonJS((exports, module) => { module.exports = 1; require.main === module && cp.spawn('cmd'); }); module.exports = factory();`,
      ),
    ).not.toContain('node:child_process.spawn');
  });

  it('reads an arrow factory that returns the exports assignment', () => {
    expect(
      run(
        `${cli}${helper}const factory = commonJS((exports, module) => (module.exports = 1, require.main === module && cp.spawn('cmd'))); module.exports = factory();`,
      ),
    ).not.toContain('node:child_process.spawn');
  });
});

describe('calls that are not a CommonJS factory', () => {
  it.each(['callback', 'function callback(init) { init({}, require.main); }'])(
    'keeps the check for a callee that makes no exports object: %s',
    callee => {
      const declaration = callee === 'callback' ? '' : `${callee}\n`;
      expect(
        run(
          `${cli}${declaration}callback((exports, module) => { module.exports = 1; require.main === module && cp.spawn('cmd'); });`,
        ),
      ).toContain('node:child_process.spawn');
    },
  );

  it.each([
    'module = require.main;',
    'function reset() { module = require.main; } reset();',
    'module++;',
  ])('keeps the check when the factory writes its module parameter: %s', write => {
    expect(
      run(
        `${cli}${helper}const factory = commonJS((exports, module) => { module.exports = 1; ${write} require.main === module && cp.spawn('cmd'); }); module.exports = factory();`,
      ),
    ).toContain('node:child_process.spawn');
  });
});
