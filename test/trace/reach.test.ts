import { describe, expect, it } from 'vite-plus/test';

import { entry, fs, lib, reached, twoHelpers } from './reached.ts';
import type { Source } from './reached.ts';

describe('the exports a module is used for', () => {
  it('leaves out an export nothing imports', () => {
    expect(
      reached({
        'index.js': entry("import { upper } from './lib.js';\nupper('a');", {
          './lib.js': 'lib.js',
        }),
        'lib.js': twoHelpers,
      }),
    ).toEqual({ 'index.js': [], 'lib.js': [] });
  });

  it('keeps an export that is imported, under any name', () => {
    for (const specifier of ['watchDir', 'watchDir as run']) {
      expect(
        reached({
          'index.js': entry(`import { ${specifier} } from './lib.js';\nrun?.(); watchDir?.();`, {
            './lib.js': 'lib.js',
          }),
          'lib.js': twoHelpers,
        })['lib.js'],
      ).toEqual(['node:fs.watch']);
    }
  });

  it('leaves out an export that is imported but never used', () => {
    expect(
      reached({
        'index.js': entry("import { watchDir } from './lib.js';", { './lib.js': 'lib.js' }),
        'lib.js': twoHelpers,
      })['lib.js'],
    ).toEqual([]);
  });

  it('keeps every export of the entry, and only the exports of it', () => {
    const files = {
      'index.js': lib(
        "export function handler() {\n  return fs.watch('.');\n}\nfunction dead() {\n  return fs.watchFile('.');\n}",
      ),
    };
    expect(reached(files)['index.js']).toEqual(['node:fs.watch']);
  });
});

describe('what an export uses', () => {
  it('follows what an export uses, through other functions and classes', () => {
    const code = `${fs}export function run() {\n  return helper();\n}\nfunction helper() {\n  return new Watcher();\n}\nclass Watcher {\n  start() {\n    fs.watch('.');\n  }\n}\nfunction dead() {\n  fs.watchFile('.');\n}`;
    expect(
      reached({
        'index.js': entry("import { run } from './lib.js';\nrun();", { './lib.js': 'lib.js' }),
        'lib.js': { code },
      })['lib.js'],
    ).toEqual(['node:fs.watch']);
  });

  it('keeps code that runs when the module loads', () => {
    const code = `${fs}fs.watch('.');\nconst stop = fs.watchFile('.');\nexport function unused() {}`;
    expect(
      reached({
        'index.js': entry("import './lib.js';", { './lib.js': 'lib.js' }),
        'lib.js': { code },
      })['lib.js'],
    ).toEqual(['node:fs.watch', 'node:fs.watchFile']);
  });

  it('keeps a function that loading code calls or passes on', () => {
    const code = `${fs}function watchDir() {\n  fs.watch('.');\n}\nfunction other() {\n  fs.watchFile('.');\n}\nsetup(watchDir);\nexport { other };`;
    expect(
      reached({
        'index.js': entry("import './lib.js';", { './lib.js': 'lib.js' }),
        'lib.js': { code },
      })['lib.js'],
    ).toEqual(['node:fs.watch']);
  });
});

describe('what a module runs when it loads', () => {
  it('keeps a class whose definition runs code', () => {
    const code = `${fs}export class Plain {\n  run() {\n    fs.watch('.');\n  }\n}\nexport class Static {\n  static value = fs.watchFile('.');\n}\nexport class Block {\n  static {\n    fs.unwatchFile('.');\n  }\n}\nexport class Keyed {\n  [fs.cp('.')]() {}\n}\nexport class Decorated {\n  constructor(@inject(fs.rm('.')) dir) {}\n}`;
    expect(
      reached({
        'index.js': entry('import {} from "./lib.ts";', { './lib.ts': 'lib.ts' }),
        'lib.ts': { code },
      })['lib.ts'],
    ).toEqual(['node:fs.watchFile', 'node:fs.unwatchFile', 'node:fs.cp', 'node:fs.rm']);
  });

  it('keeps a constant that holds a function, and code that a constant runs', () => {
    const code = `${fs}export const watchDir = () => fs.watch('.');\nexport const started = fs.watchFile('.');`;
    const files = (name: string): Record<string, Source> => ({
      'index.js': entry(`import { ${name} } from './lib.js';\n${name}();`, {
        './lib.js': 'lib.js',
      }),
      'lib.js': { code },
    });
    expect(reached(files('watchDir'))['lib.js']).toEqual(['node:fs.watch', 'node:fs.watchFile']);
    expect(reached(files('other'))['lib.js']).toEqual(['node:fs.watchFile']);
  });
});

describe('names that come from a built-in', () => {
  it('leaves out an import nothing that is used mentions', () => {
    const code =
      "import { watch } from 'node:fs';\nexport function run() {\n  return watch('.');\n}\nexport function idle() {}";
    const files = (name: string): Record<string, Source> => ({
      'index.js': entry(`import { ${name} } from './lib.js';\n${name}();`, {
        './lib.js': 'lib.js',
      }),
      'lib.js': { code },
    });
    expect(reached(files('run'))['lib.js']).toEqual(['node:fs.watch']);
    expect(reached(files('idle'))['lib.js']).toEqual([]);
  });
});

describe('modules that pass exports on', () => {
  const barrel = "export { upper } from './strings.js';\nexport { watchDir } from './watch.js';";
  const files = (code: string): Record<string, Source> => ({
    'index.js': entry(code, { './lib.js': 'lib.js' }),
    'lib.js': entry(barrel, { './strings.js': 'strings.js', './watch.js': 'watch.js' }),
    'strings.js': { code: 'export function upper(text) {\n  return text.toUpperCase();\n}' },
    'watch.js': twoHelpers,
  });

  it('asks only for the names that come through', () => {
    const found = reached(files("import { upper } from './lib.js';\nupper('a');"));
    expect(found['watch.js']).toEqual([]);
    expect(
      reached(files("import { watchDir } from './lib.js';\nwatchDir('.');"))['watch.js'],
    ).toEqual(['node:fs.watch']);
  });
});

describe('modules that pass exports on with export *', () => {
  it('follows export * and export * as', () => {
    const star = (declaration: string): Record<string, Source> => ({
      'index.js': entry("import { watchDir } from './lib.js';\nwatchDir('.');", {
        './lib.js': 'lib.js',
      }),
      'lib.js': entry(declaration, { './watch.js': 'watch.js' }),
      'watch.js': twoHelpers,
    });
    expect(reached(star("export * from './watch.js';"))['watch.js']).toEqual(['node:fs.watch']);
    expect(reached(star("export * as tools from './watch.js';"))['watch.js']).toEqual([]);
  });

  it('follows a name that is imported and then exported', () => {
    const found = reached({
      'index.js': entry("import { watchDir } from './lib.js';\nwatchDir('.');", {
        './lib.js': 'lib.js',
      }),
      'lib.js': entry("import { watchDir } from './watch.js';\nexport { watchDir };", {
        './watch.js': 'watch.js',
      }),
      'watch.js': twoHelpers,
    });
    expect(found['watch.js']).toEqual(['node:fs.watch']);
  });

  it('traces the default export', () => {
    const watch = lib(
      'export default function (dir) {\n  return fs.watch(dir);\n}\nexport function other() {}',
    );
    const files = (name: string): Record<string, Source> => ({
      'index.js': entry(`import ${name} from './lib.js';\n${name}('.');`, { './lib.js': 'lib.js' }),
      'lib.js': watch,
    });
    expect(reached(files('run'))['lib.js']).toEqual(['node:fs.watch']);
    expect(
      reached({
        'index.js': entry("import { other } from './lib.js';\nother();", { './lib.js': 'lib.js' }),
        'lib.js': watch,
      })['lib.js'],
    ).toEqual([]);
  });
});
