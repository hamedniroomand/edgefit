import type { RowFinding } from '@scripts/package-table/verify/judge.mjs';
import {
  importsOf,
  namesFrom,
  planOf,
  rowFindings,
  scriptOf,
  scriptProblem,
} from '@scripts/package-table/verify/scripts.mjs';
import { describe, expect, it } from 'vite-plus/test';

import { fixture } from '~/helpers.ts';

const finding = (api: string, exports?: string[]): RowFinding => ({
  api,
  category: 'unsupported',
  level: 'error',
  detail: 'throws ERR_METHOD_NOT_IMPLEMENTED',
  ...(exports === undefined ? {} : { exports }),
});
const result = (status: string, cell: object = {}): object => ({
  package: 'chokidar',
  resolved: '5.0.0',
  summary: { workerd: status },
  entries: [{ subpath: '.', results: { workerd: { status, errors: 1, warnings: 0, ...cell } } }],
});

describe('the imports of a reach script', () => {
  it('reads named, default and namespace imports, and a subpath of the package', () => {
    const imports = importsOf(
      "import a, { watch as w } from 'pkg';\nimport * as all from 'pkg/sub';\nimport fs from 'node:fs';",
    );
    expect(namesFrom(imports, 'pkg')).toEqual(['default', 'watch', '*']);
    expect(namesFrom(imports, 'pk')).toEqual([]);
  });
});

describe('a reach script against the findings of its row', () => {
  const imports = importsOf("import { MockAgent } from 'undici';");

  it('is rejected when it imports nothing from the package', () => {
    expect(
      scriptProblem(importsOf("import fs from 'node:fs';"), 'undici', [finding('a', ['x'])]),
    ).toBe('imports nothing from undici');
  });

  it('is rejected when it imports only names outside the export list', () => {
    const findings = [finding('node:console.Console', ['fetch'])];
    expect(scriptProblem(imports, 'undici', findings)).toBe(
      'imports none of the exports that reach a finding: fetch',
    );
  });

  it('is accepted when it imports a name in the list, or when a finding has no list', () => {
    expect(
      scriptProblem(imports, 'undici', [finding('node:console.Console', ['MockAgent'])]),
    ).toBeUndefined();
    expect(scriptProblem(imports, 'undici', [finding('node:http2.connect')])).toBeUndefined();
  });
});

describe('the findings of a row', () => {
  it('joins the findings that stay with the ones under exports, by API', () => {
    const cell = {
      findings: [finding('node:http2.connect')],
      exports: ['MockAgent', 'SnapshotAgent'].map(name => ({
        name,
        level: 'error',
        findings: [finding('node:console.Console')],
      })),
    };
    expect(rowFindings(result('fail', cell), 'workerd')).toEqual([
      finding('node:http2.connect'),
      finding('node:console.Console', ['MockAgent', 'SnapshotAgent']),
    ]);
  });
});

describe('the plan of a package on a runtime', () => {
  const real = scriptOf(fixture('../../table/verify'), 'chokidar');

  it('loads a pass row and runs the script of a fail row', () => {
    expect(planOf(result('pass'), 'workerd', real)?.kind).toBe('load');
    expect(
      planOf(result('fail', { findings: [finding('node:fs.watch')] }), 'workerd', real),
    ).toMatchObject({ kind: 'reach', script: real });
    expect(planOf(result('fail'), 'workerd')?.kind).toBe('load');
  });

  it('loads the main subpath of a row that names one', () => {
    expect(
      planOf({ ...result('pass'), package: 'firebase', main: './app' }, 'workerd'),
    ).toMatchObject({
      specifier: 'firebase/app',
    });
    expect(planOf(result('pass'), 'workerd')?.specifier).toBe('chokidar');
  });

  it('runs nothing for a warn row, an error row or a missing target', () => {
    expect(planOf(result('warn'), 'workerd', real)).toBeUndefined();
    expect(
      planOf({ ...result('fail'), error: 'npm install failed' }, 'workerd', real),
    ).toBeUndefined();
    expect(planOf(result('fail'), 'bun', real)).toBeUndefined();
  });

  it.each([
    ['nothing', 'imports nothing from chokidar'],
    ['outside', 'imports none of the exports that reach a finding: watch'],
  ])('rejects the script %s and loads only', (name, problem) => {
    const row = result('fail', {
      exports: [{ name: 'watch', level: 'error', findings: [finding('node:fs.watch')] }],
    });
    expect(planOf(row, 'workerd', fixture(`verify/scripts/${name}.mjs`))).toMatchObject({
      kind: 'load',
      problem,
    });
  });

  it('finds no script for a package without one', () => {
    expect(scriptOf(fixture('verify/scripts'), 'chokidar')).toBeUndefined();
  });
});
