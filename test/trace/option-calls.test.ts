import { describe, expect, it } from 'vite-plus/test';

import { collectFindings, defaultLevels } from '@/core/findings.ts';
import type { ModuleUsages } from '@/core/findings.ts';
import { extractUsages } from '@/extract/index.ts';
import { tagUsagesByExport } from '@/trace/by-export.ts';
import { reachedUsages } from '@/trace/reach.ts';
import type { Usage } from '@/types.ts';
import { stubTarget } from '~/helpers.ts';

import { build, entry } from './reached.ts';

const target = stubTarget({
  'tls.connect': { status: 'mismatch', note: 'throws', options: ['ALPNProtocols'] },
});
const lib = {
  code: "import { connect } from 'node:tls';\nexport function secure(o) {\n  return connect(o);\n}\nexport function h2(o) {\n  return connect({ ...o, ALPNProtocols: ['h2'] });\n}",
};

/** The `line exports` of each finding, for the usages that `lib.js` keeps. */
function findingsOf(usages: readonly Usage[]): string[] {
  const modules: ModuleUsages[] = [
    { file: 'lib.js', package: undefined, chain: [], usages: [...usages] },
  ];
  return collectFindings(modules, { target, levels: defaultLevels, ignore: [] }).findings.map(
    finding => `${finding.location.line} ${finding.exports?.join(',') ?? '-'}`,
  );
}

function reachedFrom(code: string): readonly Usage[] {
  const { graph, modules } = build({
    'index.js': entry(code, { './lib.js': 'lib.js' }),
    'lib.js': lib,
  });
  return tagUsagesByExport(graph, modules, reachedUsages(graph, modules)).get('lib.js') ?? [];
}

describe('the call of a named import that passes an option that fails', () => {
  it('gives no finding when the entry calls only the export without the option', () => {
    expect(findingsOf(reachedFrom("import { secure } from './lib.js';\nsecure({});"))).toEqual([]);
  });

  it('gives the finding at the call when the entry calls the export with the option', () => {
    expect(findingsOf(reachedFrom("import { h2 } from './lib.js';\nh2({});"))).toEqual(['6 h2']);
  });

  it('names only the export that reaches the call', () => {
    const code = "import * as m from './lib.js';\nexport { m };";
    expect(findingsOf(reachedFrom(code))).toEqual(['6 h2']);
  });

  it('gives no finding for a call in a function that only the command line runs', () => {
    const source =
      "import { connect } from 'node:tls';\nfunction command() {\n  connect({ ALPNProtocols: [] });\n}\nrequire.main === module && command();";
    const usages = extractUsages('lib.js', source, {
      globals: new Set(),
      nodeEnv: undefined,
      imported: true,
    });
    expect(findingsOf(usages)).toEqual([]);
  });
});
