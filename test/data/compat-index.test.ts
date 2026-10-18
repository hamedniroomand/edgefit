import { describe, expect, it } from 'vite-plus/test';

import { CompatIndex } from '@/data/compat-index.ts';
import { findDataDirectory } from '@/data/data-directory.ts';
import type { DumpNode, LookupResult } from '@/data/dump.ts';
import { matrixProvider } from '@/data/providers/matrix.ts';
import { overridesProvider } from '@/data/providers/overrides.ts';
import type { CompatEntry } from '@/data/providers/provider.ts';

const dataDirectory = findDataDirectory();
const data = new CompatIndex(
  matrixProvider('workerd').load(dataDirectory),
  overridesProvider('workerd').load(dataDirectory),
);

function statusOf(module: string, ...path: string[]): string {
  return data.lookup({ module, path }).status;
}

describe('compatibility data lookups', () => {
  it('reports supported APIs', () => {
    expect(statusOf('fs', 'readFileSync')).toBe('supported');
    expect(statusOf('path', 'join')).toBe('supported');
  });

  it('reports APIs missing from the workerd dump as unsupported', () => {
    expect(statusOf('crypto', 'argon2')).toBe('unsupported');
  });

  it('applies curated overrides for APIs that exist but throw', () => {
    expect(statusOf('fs', 'watch')).toBe('unsupported');
    expect(statusOf('fs', 'promises', 'watch')).toBe('unsupported');
    expect(statusOf('child_process', 'exec')).toBe('unsupported');
    expect(data.lookup({ module: 'fs', path: ['watch'] }).source).toContain(
      'internal_fs_callback.ts',
    );
  });

  it('applies curated overrides for APIs that silently do nothing', () => {
    expect(statusOf('dgram', 'createSocket')).toBe('mocked');
  });

  it('treats a default import as the module itself', () => {
    expect(statusOf('fs', 'default', 'watch')).toBe('unsupported');
  });

  it('reports type differences as mismatches', () => {
    expect(statusOf('process', 'release', 'lts')).toBe('mismatch');
  });

  it('does not report members Node itself lacks', () => {
    expect(statusOf('fs', 'notARealApi')).toBe('supported');
  });

  it('reports modules the data does not describe as uncovered', () => {
    expect(statusOf('tty', 'isatty')).toBe('uncovered');
  });

  it('knows which subtrees contain problems', () => {
    expect(data.hasProblemsBelow({ module: 'fs', path: [] })).toBe(true);
    expect(data.hasProblemsBelow({ module: 'path', path: [] })).toBe(false);
    expect(data.hasProblemsBelow({ module: 'fs', path: ['readFile'] })).toBe(false);
  });
});

describe('an entry with options below its module', () => {
  it('counts as a problem only with withOptions', () => {
    const connect = { module: 'tls', path: ['connect'] };
    expect(data.hasProblemsBelow(connect)).toBe(false);
    expect(data.hasProblemsBelow(connect, true)).toBe(true);
    // tls.createServer and tls.Server are unsupported, so the module still has problems.
    expect(data.hasProblemsBelow({ module: 'tls', path: [] })).toBe(true);
  });
});

describe('workerd APIs that return a stub', () => {
  it('marks process.report.getReport, which returns an empty report', () => {
    expect(statusOf('process', 'report', 'getReport')).toBe('mismatch');
    expect(data.lookup({ module: 'process', path: ['report', 'getReport'] }).source).toContain(
      'public_process.ts',
    );
  });
});

describe('absent overrides', () => {
  it('reports an override that says absent as absent', () => {
    const source = { provider: 'overrides/workerd', version: '1' };
    const withAbsent = new CompatIndex(matrixProvider('workerd').load(dataDirectory), [
      {
        target: 'workerd',
        module: 'fs',
        path: ['glob'],
        status: 'unsupported',
        absent: true,
        source,
      },
      { target: 'workerd', module: 'fs', path: ['watch'], status: 'unsupported', source },
    ]);
    expect(withAbsent.lookup({ module: 'fs', path: ['glob'] }).absent).toBe(true);
    expect(withAbsent.lookup({ module: 'fs', path: ['watch'] }).absent).toBeUndefined();
  });
});

describe('a curated entry below the queried API', () => {
  const source = { provider: 'test', version: '1' };
  // `m.f` is a function in Node but an object on the target, so the tree alone gives a mismatch.
  const tree = {
    baseline: { m: { '*self*': 'object', f: 'function', g: 'function' } },
    runtime: { m: { '*self*': 'object', f: 'object', g: 'function' } },
    source,
  };
  const entry = (path: string[], fields: Partial<CompatEntry>): CompatEntry => ({
    target: 'workerd',
    module: 'm',
    path,
    status: 'supported',
    source,
    ...fields,
  });
  const module = { module: 'm', path: [] };

  it('decides its part of the tree', () => {
    expect(new CompatIndex(tree).hasProblemsBelow(module)).toBe(true);
    expect(new CompatIndex(tree, [entry(['f'], {})]).hasProblemsBelow(module)).toBe(false);
    const options = new CompatIndex(tree, [entry(['f'], { status: 'mismatch', options: ['x'] })]);
    expect(options.hasProblemsBelow(module)).toBe(false);
    expect(options.hasProblemsBelow(module, true)).toBe(true);
  });

  it('wins over a fallback entry below it', () => {
    const fallback = [entry(['h', 'i'], { status: 'unsupported' })];
    const f = entry(['f'], {});
    expect(new CompatIndex(tree, [f], fallback).hasProblemsBelow(module)).toBe(true);
    const h = entry(['h'], {});
    expect(new CompatIndex(tree, [f, h], fallback).hasProblemsBelow(module)).toBe(false);
  });
});

const unlistedSource = { provider: 'test', version: '1' };
const object = (members: Record<string, DumpNode>): DumpNode => ({
  '*self*': 'object',
  ...members,
});
const unlistedTree = {
  baseline: {
    m: object({ gone: object({ a: 'function' }) }),
    n: {
      '*self*': 'object',
      kind: object({ a: 'function' }),
      here: object({}),
      leaf: 'function',
    },
  },
  runtime: { m: object({}), n: { '*self*': 'object', kind: 'function', here: object({}) } },
  source: unlistedSource,
};
const unlisted = new CompatIndex(unlistedTree);
const lookup = (module: string, ...path: string[]): LookupResult =>
  unlisted.lookup({ module, path });

describe('a member that the dump does not list', () => {
  it('shares the problem of a parent that the target lacks', () => {
    expect(lookup('m', 'gone', 'zzz')).toEqual({
      status: 'unsupported',
      note: 'is below an API that does not exist on the target',
      absent: true,
    });
    expect(lookup('m', 'gone', 'a').note).toBe('does not exist on the target');
  });

  it('shares the problem of a parent that has another type on the target', () => {
    expect(lookup('n', 'kind', 'zzz')).toEqual({
      status: 'mismatch',
      note: 'is below an API that is a function on the target but a object in Node',
    });
  });

  it('shares the problem of a leaf that the target lacks', () => {
    expect(lookup('n', 'leaf', 'call')).toEqual({
      status: 'unsupported',
      note: 'is below an API that does not exist on the target',
      absent: true,
    });
  });

  it('is supported below a parent that the target has', () => {
    expect(lookup('n', 'here', 'zzz')).toEqual({ status: 'supported' });
  });

  it('gives way to a fallback entry for the member, which is more specific', () => {
    const web = (module: string, path: string[]): CompatEntry => ({
      target: 'workerd',
      module,
      path,
      status: 'unsupported',
      category: 'web',
      source: unlistedSource,
    });
    const fallback = [web('m', ['gone', 'web']), web('n', ['leaf', 'web'])];
    const withFallback = new CompatIndex(unlistedTree, [], fallback);
    expect(withFallback.lookup({ module: 'm', path: ['gone', 'web'] }).category).toBe('web');
    expect(withFallback.lookup({ module: 'm', path: ['gone', 'zzz'] }).note).toBe(
      'is below an API that does not exist on the target',
    );
    // Below a leaf of the dump, the tree keeps its place before the fallback entries.
    expect(withFallback.lookup({ module: 'n', path: ['leaf', 'web'] }).category).toBeUndefined();
  });
});

describe('a module recorded as present', () => {
  it('has a result for the module itself, and not for its members', () => {
    expect(statusOf('v8')).toBe('supported');
    expect(statusOf('v8', 'getHeapStatistics')).toBe('uncovered');
    expect(statusOf('vm')).toBe('supported');
    // A member entry is more specific than the module, so it still wins.
    expect(statusOf('vm', 'runInNewContext')).toBe('unsupported');
    expect(data.hasProblemsBelow({ module: 'v8', path: [] })).toBe(true);
  });
});

describe('an exact entry', () => {
  const source = { provider: 'test', version: '1' };
  const index = new CompatIndex(
    {
      baseline: { fs: { readFile: 'function' } },
      runtime: { fs: { readFile: 'function' } },
      source,
    },
    [{ target: 'workerd', module: 'zz', path: [], status: 'supported', exact: true, source }],
  );

  it('applies to its API alone and leaves what is below it to the tree', () => {
    expect(index.lookup({ module: 'zz', path: [] }).status).toBe('supported');
    expect(index.lookup({ module: 'zz', path: ['x'] }).status).toBe('uncovered');
    expect(index.hasProblemsBelow({ module: 'zz', path: [] })).toBe(true);
    expect(index.hasProblemsBelow({ module: 'zz', path: ['x'] })).toBe(true);
  });
});
