import { mkdtempSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import { createTarget, isTargetKey } from '@/targets/index.ts';
import { createVercelEdgeTarget } from '@/targets/vercel/index.ts';
import type { ApiRef } from '@/types.ts';
import { edgefitError, fixture } from '~/helpers.ts';

const emptyProject = mkdtempSync(path.join(tmpdir(), 'edgefit-vercel-'));
const target = createVercelEdgeTarget(emptyProject);
const status = (module: string, ...apiPath: string[]): string =>
  target.lookup({ module, path: apiPath } satisfies ApiRef).status;

describe('vercel-edge allowlist', () => {
  it('allows the five documented modules, with or without the node: prefix', () => {
    expect(status('events', 'EventEmitter')).toBe('supported');
    expect(status('buffer', 'Buffer')).toBe('supported');
    expect(status('assert', 'ok')).toBe('supported');
    expect(status('async_hooks', 'AsyncLocalStorage')).toBe('supported');
    expect(status('util', 'promisify')).toBe('supported');
  });
});

describe('vercel-edge module members', () => {
  it('keeps the members Vercel exposes that older libraries rely on', () => {
    // The docs page does not list these; next's edge sandbox and @vercel/node's dev server do.
    expect(status('util', 'inherits')).toBe('supported');
    expect(status('util', 'format')).toBe('supported');
    expect(status('util', 'promisify')).toBe('supported');
    expect(status('util', 'types')).toBe('supported');
    expect(status('async_hooks', 'AsyncResource')).toBe('supported');
    expect(status('async_hooks', 'default', 'AsyncResource')).toBe('supported');
  });

  it('reports what exists in Node but not on Vercel, instead of passing it', () => {
    expect(status('buffer', 'Blob')).toBe('unsupported');
    expect(status('buffer', 'File')).toBe('unsupported');
    expect(status('events', 'getEventListeners')).toBe('unsupported');
    expect(status('events', 'EventEmitterAsyncResource')).toBe('unsupported');
    expect(status('assert', 'partialDeepStrictEqual')).toBe('unsupported');
    expect(status('assert', 'CallTracker')).toBe('unsupported');
    expect(status('util', 'inspect')).toBe('unsupported');
    expect(status('util', 'deprecate')).toBe('unsupported');
    expect(status('async_hooks', 'createHook')).toBe('unsupported');
  });
});

describe('vercel-edge members of events, buffer and assert', () => {
  it('keeps the members of events, buffer and assert that Vercel exposes', () => {
    for (const [module, member] of [
      ['events', 'EventEmitter'],
      ['events', 'once'],
      ['events', 'errorMonitor'],
      ['buffer', 'Buffer'],
      ['buffer', 'SlowBuffer'],
      ['buffer', 'kMaxLength'],
      ['assert', 'ok'],
      ['assert', 'strict'],
      ['assert', 'throws'],
      ['assert', 'AssertionError'],
    ] as const) {
      expect(status(module, member)).toBe('supported');
    }
  });
});

describe('vercel-edge built-ins outside the allowlist', () => {
  it('reports every Node built-in outside the allowlist as unsupported, not silently fine', () => {
    const allowed = new Set(['events', 'buffer', 'assert', 'async_hooks', 'util']);
    const builtins = builtinModules
      .map(name => name.replace(/^node:/u, ''))
      .filter(name => !name.startsWith('_') && !name.startsWith('internal/') && !allowed.has(name));
    expect(builtins.length).toBeGreaterThan(30);
    const lenient = builtins.filter(name => status(name) !== 'unsupported');
    expect(lenient).toEqual([]);
    expect(status('child_process', 'spawn')).toBe('unsupported');
    expect(status('worker_threads', 'Worker')).toBe('unsupported');
    expect(status('test')).toBe('unsupported');
  });

  it('reports every other Node built-in as missing', () => {
    expect(target.lookup({ module: 'fs', path: ['readFile'] })).toMatchObject({
      status: 'unsupported',
      absent: true,
    });
    expect(status('path', 'join')).toBe('unsupported');
    expect(status('crypto', 'createHash')).toBe('unsupported');
  });
});

describe('vercel-edge globals', () => {
  it('keeps Buffer and process.env but not the rest of process', () => {
    expect(status('*globals*', 'Buffer')).toBe('supported');
    expect(status('*globals*', 'process', 'env')).toBe('supported');
    expect(status('*globals*', 'process', 'cwd')).toBe('unsupported');
  });

  it('blocks dynamic code and compiling WebAssembly from bytes', () => {
    expect(status('*globals*', 'eval')).toBe('unsupported');
    expect(status('*globals*', 'WebAssembly', 'compile')).toBe('unsupported');
    expect(status('*globals*', 'Function', '(string)')).toBe('unsupported');
    expect(status('*globals*', 'WebAssembly', 'instantiate')).toBe('supported');
  });

  it('keeps the documented Web APIs', () => {
    expect(status('*globals*', 'fetch')).toBe('supported');
    expect(status('*globals*', 'URLPattern')).toBe('supported');
  });
});

describe('vercel-edge target info', () => {
  it('is a known target resolved for the browser with the edge-light condition', () => {
    expect(isTargetKey('vercel-edge')).toBe(true);
    const created = createTarget('vercel-edge', emptyProject, {});
    expect(created.info.key).toBe('vercel-edge');
    expect(created.info.platform).toBe('Vercel Edge');
    expect(created.info.conditions).toEqual(['edge-light', 'module']);
    expect(created.resolvePlatform).toBe('browser');
    expect(created.runtimes).toEqual(['vercel-edge']);
  });

  it('names the docs date and says the data is not from production', () => {
    expect(target.info.data).toContain('allowlist/vercel-edge (vercel-edge 2026-08-03)');
    expect(target.info.settings).toBe(
      'Vercel Edge runtime as documented on 2026-08-03, no middleware file found',
    );
    expect(target.info.notes.join('\n')).toContain('not on a run in production');
    expect(target.info.notes.join('\n')).toContain('recommends the Node.js runtime');
  });

  it('uses middleware.ts as the entry', () => {
    const { info, defaultEntries } = createVercelEdgeTarget(fixture('vercel-app'));
    expect(defaultEntries).toEqual(['middleware.ts']);
    expect(info.settings).toContain('entry middleware.ts');
  });
});

describe('vercel-edge globals the docs table omits', () => {
  it('keeps the ECMAScript builtins of V8', () => {
    for (const name of ['Uint16Array', 'WeakRef', 'globalThis', 'AggregateError', 'Iterator']) {
      expect(status('*globals*', name)).toBe('supported');
    }
  });

  it('keeps the web globals Vercel’s own emulator provides', () => {
    for (const name of ['queueMicrotask', 'performance', 'TextEncoderStream', 'WebSocket']) {
      expect(status('*globals*', name)).toBe('supported');
    }
  });

  it('still reports Node-only globals as missing', () => {
    for (const name of ['setImmediate', 'clearImmediate', 'global']) {
      expect(status('*globals*', name)).toBe('unsupported');
    }
  });
});

describe('vercel-edge data provenance', () => {
  const read = (file: string): unknown =>
    JSON.parse(readFileSync(path.join(import.meta.dirname, '../../data', file), 'utf8')) as unknown;

  it('pins both data files to the docs page and its date', () => {
    const { sources } = read('source.json') as {
      sources: { provider: string; url: string; versions: Record<string, string> }[];
    };
    for (const provider of ['allowlist/vercel-edge', 'overrides/vercel-edge']) {
      const source = sources.find(entry => entry.provider === provider);
      expect(source?.url).toBe('https://vercel.com/docs/functions/runtimes/edge');
      expect(source?.versions['vercel-edge']).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    }
  });

  it('cites a docs anchor for every curated override', () => {
    const { apis } = read('overrides/vercel-edge.json') as {
      apis: Record<string, { source: string }>;
    };
    for (const entry of Object.values(apis)) {
      expect(entry.source).toMatch(/^#[a-z-]+$/u);
    }
  });
});

describe('vercel-edge without an entry', () => {
  it('asks for --entry in its own terms, without pointing at wrangler', async () => {
    const error = await edgefitError(
      check({ root: emptyProject, config: { targets: ['vercel-edge'] } }),
    );
    expect(error.hint).toContain('No middleware file found.');
    expect(error.hint).not.toContain('wrangler');
  });
});

describe('vercel-edge middleware that picks its own runtime', () => {
  it('skips a middleware that sets runtime nodejs, and says why', async () => {
    const target = createVercelEdgeTarget(fixture('vercel-node-middleware'));
    expect(target.defaultEntries).toEqual([]);
    expect(target.info.settings).toContain('middleware.ts runs on Node.js');
    expect(target.info.notes.join('\n')).toContain("middleware.ts sets runtime 'nodejs'");
    const error = await edgefitError(
      check({ root: fixture('vercel-node-middleware'), config: { targets: ['vercel-edge'] } }),
    );
    expect(error.hint).toContain("sets runtime 'nodejs'");
  });

  it('keeps a middleware that sets runtime edge, or no runtime', () => {
    expect(createVercelEdgeTarget(fixture('vercel-edge-config')).defaultEntries).toEqual([
      'middleware.ts',
    ]);
    expect(createVercelEdgeTarget(fixture('vercel-app')).defaultEntries).toEqual(['middleware.ts']);
  });
});

describe('vercel-edge imports of Node.js modules', () => {
  const root = fixture('vercel-lazy');

  it('reports a use that is not behind a check, and not the imports or the guarded uses', async () => {
    const [report] = (await check({ root, config: { targets: ['vercel-edge'] } })).reports;
    expect(report?.findings.map(finding => `${finding.api} ${finding.location.line}`)).toEqual([
      'node:fs.statSync 15',
    ]);
    expect(report?.guarded.map(finding => finding.api)).toEqual(
      expect.arrayContaining(['node:fs.readFileSync']),
    );
  });

  it('still reports the import line where the platform does not stub the module out', async () => {
    const [report] = (
      await check({ root, config: { targets: ['workerd'], entry: 'middleware.ts' } })
    ).reports;
    const watch = report?.findings.find(finding => finding.api === 'node:fs.watch');
    expect(watch?.location).toMatchObject({ file: 'lib.ts', line: 4 });
  });

  it('says in the notes that the import alone does not fail', () => {
    expect(target.info.notes.join('\n')).toContain(
      'Importing a Node.js module Vercel lacks is not reported',
    );
  });
});
