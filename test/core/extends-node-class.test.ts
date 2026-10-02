import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import { classify } from '@/core/classify.ts';
import { CompatIndex } from '@/data/compat-index.ts';
import { extractUsages } from '@/extract/index.ts';
import type { Target } from '@/targets/index.ts';
import { fixture, stubTarget } from '~/helpers.ts';

describe('a class that extends a Node.js class', () => {
  it('has no finding on workerd, bun and deno', async () => {
    const result = await check({
      root: fixture('extends-app'),
      config: { targets: ['workerd', 'bun', 'deno'], entry: 'src/index.js' },
    });
    expect(result.reports.map(report => report.findings.map(finding => finding.api))).toEqual([
      [],
      [],
      [],
    ]);
  });
});

const reason = 'extended by a class, so its instance members may be used elsewhere';

describe('a class whose data lacks an instance member', () => {
  const tree = {
    '*self*': 'object',
    default: { '*self*': 'function', prototype: { emit: 'function' } },
  };
  const index = new CompatIndex(
    {
      baseline: { events: tree },
      runtime: { events: tree },
      source: { provider: 'test', version: '1' },
    },
    [
      {
        target: 'workerd',
        module: 'events',
        path: ['prototype', 'emit'],
        status: 'unsupported',
        source: { provider: 'test', version: '1' },
      },
    ],
  );
  const target: Target = {
    ...stubTarget(),
    lookup: api => index.lookup(api),
    hasProblemsBelow: api => index.hasProblemsBelow(api),
  };

  function details(source: string): (string | undefined)[] {
    return extractUsages('src/input.ts', source, { globals: new Set(), nodeEnv: 'production' }).map(
      usage => classify(usage, target)?.detail,
    );
  }

  it('still warns for a class that extends the parent', () => {
    expect(details("import E from 'events';\nclass A extends E {}")).toContain(
      `cannot be checked statically: ${reason}`,
    );
  });

  it('still warns for util.inherits', () => {
    const source = "import E from 'events';\nimport { inherits } from 'util';\ninherits(A, E);";
    expect(details(source)).toContain(`cannot be checked statically: ${reason}`);
  });
});
