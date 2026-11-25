import process from 'node:process';

import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { debugVariable } from '@/trace/debug.ts';
import { reachedUsages } from '@/trace/reach.ts';

import { build, entry, lib } from './reached.ts';

const files = {
  'index.js': entry("import { a } from './lib.js';\nexport { a };", { './lib.js': 'lib.js' }),
  'lib.js': {
    ...lib(
      "import * as other from './other.js';\nexport function a() {\n  return other;\n}\nexport function b() {\n  return fs.watch('.');\n}\nfs.stat('.');\n",
    ),
    imports: { './other.js': 'other.js' },
  },
  'other.js': lib('export const c = 1;\n'),
};

/** What one trace of the files prints with the variable set to `value`. */
function printed(value: string, names?: string[]): string {
  vi.stubEnv(debugVariable, value);
  const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  const { graph, modules } = build(files);
  reachedUsages(
    graph,
    modules,
    names === undefined ? undefined : { entry: 'index.js', names: new Set(names) },
  );
  return write.mock.calls.map(([text]) => String(text)).join('');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('the debug output of the trace', () => {
  it('prints nothing when the variable is empty', () => {
    expect(printed('')).toBe('');
  });

  it('lists each loaded file, what is asked of it, who asked for all of it, and its live units', () => {
    expect(printed('*')).toBe(
      [
        'edgefit trace: the whole graph',
        '  index.js  asked: all  live: 3/3 [2 at load, a]',
        '  lib.js  asked: a  live: 6/7 [3 at load, a, other, fs]',
        '  other.js  asked: all (all from lib.js)  live: 2/3 [2 at load]',
        '',
      ].join('\n'),
    );
  });

  it('marks a file that cannot be traced as opaque', () => {
    vi.stubEnv(debugVariable, '*');
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const { graph, modules } = build({
      'index.js': entry("import './cjs.js';", { './cjs.js': 'cjs.js' }),
      'cjs.js': { code: 'fill(module.exports);\n' },
    });
    reachedUsages(graph, modules);
    expect(write.mock.calls.map(([text]) => String(text)).join('')).toContain(
      '  cjs.js  opaque  asked: nothing',
    );
  });

  it('prints only the trace that asks for the named export', () => {
    expect(printed('b', ['a'])).toBe('');
    expect(printed('b', ['b'])).toContain('edgefit trace: b\n');
  });
});
