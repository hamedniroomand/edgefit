import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const fs = "import fs from 'node:fs';\n";
const plainWatch = ['api node:fs', 'api node:fs.watch'];

const filtered = (code: string, load: string): string =>
  `try {\n  ${load}\n} catch (error) {\n  if (error.code !== '${code}') throw error;\n}`;

describe('a catch that throws again only for another error code', () => {
  it('guards an import when the code is ERR_UNKNOWN_BUILTIN_MODULE', () => {
    expect(usagesOf(filtered('ERR_UNKNOWN_BUILTIN_MODULE', "await import('node:sqlite')"))).toEqual(
      ['api node:sqlite [guarded]'],
    );
    const compound =
      "try {\n  await import('node:sqlite');\n} catch (error) {\n  if (error !== null && typeof error === 'object' && 'code' in error && error.code !== 'ERR_UNKNOWN_BUILTIN_MODULE') throw error;\n}";
    expect(usagesOf(compound)).toEqual(['api node:sqlite [guarded]']);
  });

  it('picks the code from the module name, as Node.js does', () => {
    expect(usagesOf(filtered('ERR_UNKNOWN_BUILTIN_MODULE', "require('node:sqlite')"))).toEqual([
      'api node:sqlite [guarded]',
    ]);
    expect(usagesOf(filtered('MODULE_NOT_FOUND', "require('fs')"))).toEqual([
      'api node:fs [guarded]',
    ]);
    expect(usagesOf(filtered('ERR_MODULE_NOT_FOUND', "await import('fs')"))).toEqual([
      'api node:fs [guarded]',
    ]);
  });

  it('still guards when the catch only defines a function that throws', () => {
    const source =
      "try {\n  await import('node:sqlite');\n} catch (error) {\n  const later = () => {\n    throw error;\n  };\n  if (error.code !== 'ERR_UNKNOWN_BUILTIN_MODULE') throw error;\n}";
    expect(usagesOf(source)).toEqual(['api node:sqlite [guarded]']);
  });

  it('does not guard a load whose error the catch still throws', () => {
    expect(usagesOf(filtered('MODULE_NOT_FOUND', "await import('node:sqlite')"))).toEqual([
      'api node:sqlite',
    ]);
    expect(usagesOf(filtered('MODULE_NOT_FOUND', "require('node:sqlite')"))).toEqual([
      'api node:sqlite',
    ]);
    expect(usagesOf(filtered('MODULE_NOT_FOUND', "await import('fs')"))).toEqual(['api node:fs']);
    expect(usagesOf(`${fs}${filtered('ERR_UNKNOWN_BUILTIN_MODULE', "fs.watch('.')")}`)).toEqual(
      plainWatch,
    );
    const rethrown =
      "try {\n  await import('node:sqlite');\n} catch (error) {\n  if (error.code !== 'ERR_UNKNOWN_BUILTIN_MODULE') {\n    log(error);\n  } else {\n    throw error;\n  }\n}";
    expect(usagesOf(rethrown)).toEqual(['api node:sqlite']);
    const either =
      "try {\n  await import('node:sqlite');\n} catch (error) {\n  if (error.code !== 'ERR_UNKNOWN_BUILTIN_MODULE' || other) throw error;\n}";
    expect(usagesOf(either)).toEqual(['api node:sqlite']);
  });
});

describe('the members of a module that a filtered catch guards', () => {
  it('guards the members read after the load in the same block', () => {
    const assigned = filtered(
      'ERR_UNKNOWN_BUILTIN_MODULE',
      "({ DatabaseSync } = await import('node:sqlite'));",
    );
    expect(usagesOf(`let DatabaseSync;\n${assigned}`)).toEqual([
      'api node:sqlite [guarded]',
      'api node:sqlite.DatabaseSync [after load]',
    ]);
    const declared = filtered(
      'ERR_UNKNOWN_BUILTIN_MODULE',
      "const { DatabaseSync } = require('node:sqlite');",
    );
    expect(usagesOf(declared)).toEqual([
      'api node:sqlite [guarded]',
      'api node:sqlite.DatabaseSync [after load]',
    ]);
    const member = filtered(
      'ERR_UNKNOWN_BUILTIN_MODULE',
      "const m = await import('node:sqlite');\n  m.DatabaseSync;",
    );
    expect(usagesOf(member)).toEqual([
      'api node:sqlite [guarded]',
      'api node:sqlite.DatabaseSync [after load]',
    ]);
  });

  it('does not guard a use after the try block', () => {
    const load = filtered('ERR_UNKNOWN_BUILTIN_MODULE', "await import('node:sqlite');");
    expect(usagesOf(`${fs}${load}\nfs.watch('.');`)).toEqual([
      'api node:fs',
      'api node:sqlite [guarded]',
      'api node:fs.watch',
    ]);
    const after = filtered('ERR_UNKNOWN_BUILTIN_MODULE', "const m = await import('node:sqlite');");
    expect(usagesOf(`${after}\nconst { DatabaseSync } = require('node:sqlite');`)).toEqual([
      'api node:sqlite [guarded]',
      'api node:sqlite',
      'api node:sqlite.DatabaseSync',
    ]);
  });
});
