import { entry, reached } from './reached.ts';

export const fs = "const fs = require('node:fs');\n";
export const used = "function used() {\n  return fs.watch('.');\n}\n";
export const dead = "function dead() {\n  return fs.watchFile('.');\n}\n";
export const both = ['node:fs.watch', 'node:fs.watchFile'];

/** The API usages that `lib.js` keeps when the entry uses only its export `name`. */
export function libOf(code: string, name = 'used'): string[] | undefined {
  return reached({
    'index.js': entry(`import { ${name} } from './lib.js';\n${name}();`, { './lib.js': 'lib.js' }),
    'lib.js': { code: `${fs}${code}` },
  })['lib.js'];
}

/** The API usages that `lib.js` keeps when the entry only loads it. */
export function loadedOf(code: string): string[] | undefined {
  return reached({
    'index.js': entry("import './lib.js';", { './lib.js': 'lib.js' }),
    'lib.js': { code: `${fs}${code}` },
  })['lib.js'];
}

/** The API usages that `lib.js` keeps when a CommonJS entry binds it and calls its export `name` as a method. */
export function calledOf(code: string, name: string): string[] | undefined {
  return reached({
    'index.js': {
      code: `const lib = require('./lib.js');\nlib.${name}();`,
      imports: { 'require-call:./lib.js': 'lib.js' },
    },
    'lib.js': { code: `${fs}${code}` },
  })['lib.js'];
}
