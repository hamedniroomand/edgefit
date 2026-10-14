import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import type { Finding, TargetKey } from '@/types.ts';

/** Turbopack's module for `node:async_hooks`, after code of `pkg` on the same line. */
const factoryLine =
  '[1,(e,t,r)=>{require("node:child_process").spawn("x")},78500,(e,t,r)=>{t.exports=e.x("node:async_hooks",()=>require("node:async_hooks"))}];';

/**
 * A 3-line chunk with one mapping at the start of each line. Line 1 maps to a file of `pkg` and
 * holds Turbopack's module for `node:async_hooks` after the code of `pkg`. Lines 2 and 3 map to the
 * project's own code, which loads Node.js modules through Turbopack's wrapper, inline and lazy.
 */
function project(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'edgefit-generated-'));
  mkdirSync(path.join(root, 'src'));
  mkdirSync(path.join(root, 'out'));
  mkdirSync(path.join(root, 'node_modules/pkg'), { recursive: true });
  writeFileSync(
    path.join(root, 'node_modules/pkg/package.json'),
    '{"name":"pkg","version":"1.0.0"}',
  );
  writeFileSync(path.join(root, 'node_modules/pkg/index.js'), '');
  writeFileSync(path.join(root, 'src/app.ts'), '');
  writeFileSync(
    path.join(root, 'out/index.js'),
    [
      factoryLine,
      'var rS=e.x("node:timers",()=>require("node:timers"),!0);rS.setTimeout(()=>{},1);',
      'async function f(){const t=await Promise.resolve().then(()=>e.x("node:fs",()=>require("node:fs"),!0));t.watch(".")}',
      '',
    ].join('\n'),
  );
  writeFileSync(
    path.join(root, 'out/index.js.map'),
    JSON.stringify({
      version: 3,
      sources: ['../node_modules/pkg/index.js', '../src/app.ts'],
      names: [],
      mappings: 'AAAA;ACAA;AACA',
    }),
  );
  return root;
}

async function findings(target: TargetKey): Promise<string[]> {
  const result = await check({
    root: project(),
    built: 'out/index.js',
    config: { targets: [target] },
  });
  return (result.reports[0]?.findings ?? []).map((finding: Finding) => {
    const owner =
      finding.buildOutput === true ? 'build output' : (finding.package?.name ?? 'your code');
    const { file, line, column } = finding.location;
    return `${finding.api} ${owner} ${file}:${line}:${column}`;
  });
}

describe('code that the bundler wrote in a mapped chunk', () => {
  it("puts Turbopack's module for a Node.js built-in under build output, and keeps the mapped use before it", async () => {
    const column = factoryLine.lastIndexOf('"node:async_hooks"') + 1;
    expect(await findings('vercel-edge')).toEqual([
      'node:timers.setTimeout your code src/app.ts:1:1',
      'node:fs.watch your code src/app.ts:2:1',
      'node:child_process.spawn pkg node_modules/pkg/index.js:1:1',
      `node:async_hooks build output out/index.js:1:${column}`,
    ]);
  });

  it("keeps the project's own inline and lazy loads of a Node.js module at its file", async () => {
    expect(await findings('workerd')).toEqual([
      'node:fs.watch your code src/app.ts:2:1',
      'node:child_process.spawn pkg node_modules/pkg/index.js:1:1',
      'node:timers your code src/app.ts:1:1',
      'node:fs your code src/app.ts:2:1',
    ]);
  });
});
