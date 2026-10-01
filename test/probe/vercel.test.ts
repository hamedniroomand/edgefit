import { readFileSync } from 'node:fs';
import path from 'node:path';

import { renderIssue } from '@scripts/probe/drift.mjs';
import { compareDocs, hash, normalize, parseEdgeDocs } from '@scripts/probe/vercel/docs.mjs';
import { compareEmulator, knownDivergences } from '@scripts/probe/vercel/emulator.mjs';
import { describe, expect, it } from 'vite-plus/test';

const data = (file: string): unknown =>
  JSON.parse(readFileSync(path.join(import.meta.dirname, '../../data', file), 'utf8')) as unknown;
const allowlist = data('allowlists/vercel-edge.json') as {
  globals: string[];
  languageGlobals: string[];
  emulatorGlobals: string[];
  modules: Record<string, unknown>;
  docs: { moduleDescriptions: Record<string, string> };
};
const overrides = data('overrides/vercel-edge.json') as {
  apis: Record<string, unknown>;
  notModelled: string[];
};

const page = `---
last_updated: 2026-08-03
---

# Edge Runtime

## Edge Runtime supported APIs

### Network APIs

| API | Description |
| --- | --- |
| [\`fetch\`](https://developer.mozilla.org/docs/Web/API/fetch) | Fetches a resource |
| [\`Request\`](https://x) | A request |

## Check if you're running on the Edge runtime

Text.

## Compatible Node.js modules

| Module | Description |
| --- | --- |
| [\`events\`](https://nodejs.org/api/events.html) | Event emitters. This API is [fully supported](https://x) |

## Unsupported APIs

| API | Description |
| --- | --- |
| [\`eval\`](https://x) | Evaluates code |
| [\`new Function(evalString)\`](https://x) | Creates a function |
`;

describe('parseEdgeDocs', () => {
  it('reads the date, the Web APIs, the modules and the disabled features', () => {
    const parsed = parseEdgeDocs(page);
    expect(parsed.lastUpdated).toBe('2026-08-03');
    expect(parsed.globals).toEqual(['fetch', 'Request']);
    expect(Object.keys(parsed.modules)).toEqual(['events']);
    expect(parsed.blocked).toEqual(['eval', 'new Function']);
  });

  it('ignores links and spacing when it hashes a description', () => {
    expect(normalize('A [link](https://x)  and\n text')).toBe('A link and text');
    expect(hash('See [this](https://a) page')).toBe(hash('See this   page'));
  });

  it('finds nothing in a page without the tables, so the check can refuse it', () => {
    const parsed = parseEdgeDocs('# Moved\n');
    expect(parsed.lastUpdated).toBeUndefined();
    expect(Object.keys(parsed.modules)).toEqual([]);
  });
});

describe('compareDocs', () => {
  const parsed = {
    lastUpdated: '2026-08-03',
    globals: allowlist.globals.filter(name => name !== 'Buffer'),
    modules: allowlist.docs.moduleDescriptions,
    blocked: ['eval', 'new Function', 'WebAssembly.compile', 'WebAssembly.instantiate'],
  };

  it('finds no drift when the page says what the data says', () => {
    expect(compareDocs(parsed, allowlist, overrides)).toEqual([]);
  });

  it('reports a module, a Web API, a feature and a description that changed', () => {
    const changed = compareDocs(
      {
        ...parsed,
        globals: [...parsed.globals, 'Navigator'],
        modules: { ...parsed.modules, util: 'other', path: 'x' },
        blocked: [...parsed.blocked, 'Atomics.wait'],
      },
      allowlist,
      overrides,
    );
    expect(changed.map(section => section.items)).toEqual([
      ['Navigator'],
      ['path'],
      ['util'],
      ['Atomics.wait'],
    ]);
  });

  it('reports what the page dropped', () => {
    const removed = compareDocs(
      { ...parsed, globals: parsed.globals.slice(1), modules: {}, blocked: ['eval'] },
      allowlist,
      overrides,
    );
    expect(removed.map(section => section.title)).toEqual([
      expect.stringContaining('no longer lists'),
      expect.stringContaining('no longer lists'),
      expect.stringContaining('no longer lists'),
    ]);
  });
});

describe('compareEmulator', () => {
  const accepted = new Set([
    ...allowlist.globals,
    ...allowlist.languageGlobals,
    ...allowlist.emulatorGlobals,
  ]);
  const documented = allowlist.globals.filter(name => name !== 'Buffer');
  const observed = { names: [...documented, 'eval'], evalThrows: true, functionThrows: true };

  it('agrees when the emulator has what is documented and blocks dynamic code', () => {
    expect(compareEmulator(observed, documented, accepted)).toEqual([]);
  });

  it('explains the differences it already knows instead of reporting them', () => {
    const withoutKnown = documented.filter(name => !(name in knownDivergences));
    expect(compareEmulator({ ...observed, names: withoutKnown }, documented, accepted)).toEqual([]);
  });

  it('reports a documented global it lacks, a new one it has, and dynamic code it allows', () => {
    const result = compareEmulator(
      {
        names: ['fetch', 'NewThing', '__internal', 'addEventListener'],
        evalThrows: false,
        functionThrows: true,
      },
      ['fetch', 'Request'],
      accepted,
    );
    expect(result.map(section => section.items)).toEqual([['Request'], ['NewThing'], ['eval']]);
  });
});

describe('renderIssue with sections', () => {
  const drift = {
    runtime: 'vercel-edge',
    pinned: 'docs 2026-08-03',
    latest: 'docs 2026-09-01',
    nowPresent: [],
    stubsNowWork: [],
    mocksImplemented: [],
    sections: [{ title: 'Vercel docs: modules added', items: ['path'] }],
  };

  it('reports a runtime that only has sections', () => {
    const { body, drift: hasDrift } = renderIssue([drift]);
    expect(hasDrift).toBe(true);
    expect(body).toContain('### vercel-edge (pinned docs 2026-08-03, latest docs 2026-09-01)');
    expect(body).toContain('**Vercel docs: modules added**');
    expect(body).toContain('- `path`');
  });

  it('reports no drift when there are no sections', () => {
    expect(renderIssue([{ ...drift, sections: [] }]).drift).toBe(false);
  });
});
