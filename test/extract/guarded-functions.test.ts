import { describe, expect, it } from 'vite-plus/test';

import { globalsOf, usagesOf } from '~/helpers.ts';

const web = new Set(['URL', 'window']);
const save = 'function save(b) {\n  URL.createObjectURL(b);\n}\n';
const guarded = ['URL.createObjectURL [has window]'];
const plain = ['URL.createObjectURL'];

describe('guards of a local function that only guarded code reads', () => {
  it('follows the guard of a ternary that names the function (the Pinia shape)', () => {
    const source = `const IS_CLIENT = typeof window !== 'undefined';
const saveAs = !IS_CLIENT
  ? () => {}
  : typeof HTMLAnchorElement !== 'undefined'
    ? downloadSaveAs
    : fileSaverSaveAs;
function downloadSaveAs(blob) {
  const a = {};
  a.href = URL.createObjectURL(blob);
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 4e4);
}
function fileSaverSaveAs(blob) {
  URL.createObjectURL(blob);
}
saveAs(1);`;
    expect(globalsOf(source, web)).toEqual([
      'URL.createObjectURL [has window] [has HTMLAnchorElement]',
      'URL.revokeObjectURL [has window] [has HTMLAnchorElement]',
      'URL.createObjectURL [has window] [no HTMLAnchorElement]',
    ]);
  });
});

describe('guards of a local function, by kind of read and guard', () => {
  it('follows a guarded call and an arrow function', () => {
    expect(globalsOf(`${save}if (typeof window !== 'undefined') save(1);`, web)).toEqual(guarded);
    expect(
      globalsOf(
        "const s = typeof window === 'undefined' ? null : save;\nconst save = b => URL.createObjectURL(b);\ns(1);",
        web,
      ),
    ).toEqual(guarded);
  });

  it('keeps only the guards that every read shares', () => {
    const source = `${save}if (typeof window !== 'undefined' && typeof Deno === 'undefined') save(1);
if (typeof window !== 'undefined') save(2);`;
    expect(globalsOf(source, web)).toEqual(guarded);
    expect(
      usagesOf(
        "import fs from 'node:fs';\nfunction run() {\n  fs.watch('.');\n}\nif (typeof Deno !== 'undefined') run();\nif (fs.watch) run();",
      ),
    ).toEqual(['api node:fs', 'api node:fs.watch']);
  });

  it('marks a use as guarded and adds runtime and option guards', () => {
    expect(
      usagesOf(
        "import fs from 'node:fs';\nfunction run() {\n  fs.watch('.');\n}\nif (fs.watch && typeof Deno !== 'undefined') run();",
      ),
    ).toEqual(['api node:fs', 'api node:fs.watch [guarded] [deno]']);
    expect(
      usagesOf(
        "import fs from 'node:fs';\nfunction run() {\n  fs.watch('.');\n}\nexport function start(options) {\n  if (options.watch) run();\n}",
      ),
    ).toEqual(['api node:fs', 'api node:fs.watch [option watch]']);
  });
});

describe('reads of a local function that do not count', () => {
  it('drops a use that only code that never runs reaches, and ignores such a read', () => {
    const run = "import fs from 'node:fs';\nfunction run() {\n  fs.watch('.');\n}\n";
    expect(usagesOf(`${run}if (process.env.NODE_ENV !== 'production') run();`)).toEqual([
      'api node:fs',
      'api node:process.env.NODE_ENV',
    ]);
    expect(
      usagesOf(
        `${run}if (process.env.NODE_ENV !== 'production') run();\nif (typeof Deno !== 'undefined') run();`,
      ),
    ).toEqual(['api node:fs', 'api node:fs.watch [deno]', 'api node:process.env.NODE_ENV']);
  });

  it('ignores a read inside the function itself', () => {
    expect(
      globalsOf(
        "function save(b) {\n  URL.createObjectURL(b);\n  if (b) save(b - 1);\n}\nif (typeof window !== 'undefined') save(1);",
        web,
      ),
    ).toEqual(guarded);
  });
});

describe('a local function whose guard does not flow', () => {
  it('when a read is not guarded', () => {
    expect(globalsOf(`${save}if (typeof window !== 'undefined') save(1);\nsave(2);`, web)).toEqual(
      plain,
    );
    expect(
      globalsOf(
        `${save}const s = typeof window === 'undefined' ? null : save;\nlist.push(save);`,
        web,
      ),
    ).toEqual(plain);
    expect(
      globalsOf(`${save}if (typeof window !== 'undefined') save(1);\nrun(save);`, web),
    ).toEqual(plain);
  });

  it('when the file exports the function', () => {
    const call = "if (typeof window !== 'undefined') save(1);\n";
    for (const source of [
      `export ${save}${call}`,
      `export default ${save}${call}`,
      `export const save = b => URL.createObjectURL(b);\n${call}`,
      `${save}${call}export { save };`,
      `${save}${call}export default save;`,
      `${save}${call}module.exports = save;`,
      `${save}${call}module.exports = { save };`,
      `${save}${call}exports.save = save;`,
      `${save}if (typeof window !== 'undefined') exports.save = save;`,
      `${save}if (typeof window !== 'undefined') module.exports.save = save;`,
      `${save}if (typeof window !== 'undefined') module.exports = { save };`,
    ]) {
      expect(globalsOf(source, web)).toEqual(plain);
    }
  });
});

describe('a local function whose guard does not flow, for the file', () => {
  it('when the file calls eval', () => {
    expect(
      globalsOf(`${save}if (typeof window !== 'undefined') save(1);\neval(code);`, web),
    ).toEqual(plain);
  });

  it('when the file writes the name again', () => {
    expect(
      globalsOf(
        `let save = b => URL.createObjectURL(b);\nif (typeof window !== 'undefined') save(1);\nsave = other;`,
        web,
      ),
    ).toEqual(plain);
    expect(
      globalsOf(`${save}if (typeof window !== 'undefined') save(1);\nsave = other;`, web),
    ).toEqual(plain);
  });

  it('when the guard is a value that is not a check', () => {
    expect(
      globalsOf(
        `${save}let IS_CLIENT = typeof window !== 'undefined';\nIS_CLIENT = true;\nif (IS_CLIENT) save(1);`,
        web,
      ),
    ).toEqual(plain);
    expect(globalsOf(`${save}const IS_CLIENT = isClient();\nif (IS_CLIENT) save(1);`, web)).toEqual(
      plain,
    );
  });
});

describe('a local function that JSX uses', () => {
  const download =
    "function Download() {\n  URL.createObjectURL(1);\n}\nconst C = typeof Deno !== 'undefined' ? Download : null;\n";
  const url = new Set(['URL']);

  it('gets no guards from a guarded read when JSX also uses it', () => {
    for (const file of ['src/input.jsx', 'src/input.tsx']) {
      expect(usagesOf(`${download}export const App = () => <Download />;`, file, url)).toEqual([
        'api URL.createObjectURL',
      ]);
      expect(usagesOf(`${download}export const App = () => <Download.Item />;`, file, url)).toEqual(
        ['api URL.createObjectURL'],
      );
    }
  });

  it('gets the guards when only the guarded read uses it', () => {
    expect(usagesOf(`${download}export const App = () => <div />;`, 'src/input.jsx', url)).toEqual([
      'api URL.createObjectURL [deno]',
    ]);
  });
});
