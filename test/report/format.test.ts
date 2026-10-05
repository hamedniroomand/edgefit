import { describe, expect, it } from 'vite-plus/test';

import type { CheckResult } from '@/core/check.ts';
import { annotation, formatGithub } from '@/report/github.ts';
import { formatJson } from '@/report/json.ts';
import { summaryLine } from '@/report/summary.ts';
import { formatText } from '@/report/text.ts';
import type { Finding } from '@/types.ts';
import { makeFinding } from '~/helpers.ts';

const info = {
  key: 'workerd' as const,
  platform: 'workerd',
  conditions: ['workerd', 'worker'],
  data: 'matrix@abc1234',
  settings: 'compat date 2026-04-24',
  notes: [],
};

function resultOf(
  findings: ReturnType<typeof makeFinding>[],
  ignored = 0,
  guarded: ReturnType<typeof makeFinding>[] = [],
): CheckResult {
  return {
    root: '/project',
    skipped: [],
    reports: [
      {
        target: info,
        entries: ['src/index.ts'],
        modules: 3,
        findings,
        guarded,
        ignored,
        supported: [],
      },
    ],
  };
}

const chokidar = makeFinding('node:fs.watch', {
  package: { name: 'chokidar', version: '4.0.1' },
  location: { file: 'node_modules/chokidar/index.js', line: 5, column: 3 },
  chain: ['src/index.ts', 'chokidar'],
  otherLocations: [{ file: 'node_modules/chokidar/other.js', line: 1, column: 1 }],
  source: 'https://example.com/fs',
});

const withFix = makeFinding('node:fs.watch', {
  suggestion: {
    kind: 'change',
    text: 'Watch in development only.',
    target: 'workerd',
    source: 'https://example.com/watch',
  },
});

describe('suggested fixes', () => {
  it('show in the text report with their source', () => {
    const text = formatText(resultOf([withFix]), { color: false });
    expect(text).toContain('fix: Watch in development only.');
    expect(text).toContain('https://example.com/watch');
    expect(formatText(resultOf([chokidar]), { color: false })).not.toContain('fix:');
  });

  it('show a link that the finding already shows only once', () => {
    const same = { ...withFix, source: 'https://example.com/watch' };
    const text = formatText(resultOf([same]), { color: false });
    expect(text.match(/https:\/\/example\.com\/watch/gu)).toHaveLength(1);
    expect(annotation(same).match(/example\.com\/watch/gu)).toHaveLength(1);
  });

  it('show in the GitHub annotation', () => {
    expect(annotation(withFix)).toContain(
      '%0Afix: Watch in development only.%0Awhy https://example.com/watch',
    );
    expect(annotation(chokidar)).not.toContain('fix');
  });

  it('are a field of the JSON report', () => {
    const report = JSON.parse(formatJson(resultOf([withFix]))) as {
      targets: { findings: Finding[] }[];
    };
    expect(report.targets[0]?.findings[0]?.suggestion).toEqual(withFix.suggestion);
  });
});

describe('summary line', () => {
  it('pluralizes counts and shows ignored findings only when there are some', () => {
    const warning = makeFinding('node:fs.cp', { level: 'warning' });
    expect(summaryLine(resultOf([chokidar, warning, warning]))).toBe('1 error, 2 warnings');
    expect(summaryLine(resultOf([], 2))).toBe('0 errors, 0 warnings, 2 ignored');
  });
});

describe('text report', () => {
  it('lists a finding with its owner, chain and source', () => {
    const text = formatText(resultOf([chokidar]), { color: false });
    expect(text).toContain('edgefit · workerd (workerd)');
    expect(text).toContain('error    unsupported  node:fs.watch  (workerd)');
    expect(text).toContain('chokidar@4.0.1  node_modules/chokidar/index.js:5:3  (+1 more)');
    expect(text).toContain('via src/index.ts > chokidar');
    expect(text).toContain('see https://example.com/fs');
    expect(text.endsWith('1 error, 0 warnings\n')).toBe(true);
  });

  it('says so when nothing was found', () => {
    expect(formatText(resultOf([]), { color: false })).toContain(
      'No known incompatible reachable APIs found.',
    );
  });

  it('only adds ANSI styling when color is on', () => {
    expect(formatText(resultOf([chokidar]), { color: false })).not.toContain('\u001B[');
    expect(formatText(resultOf([chokidar]), { color: true })).toContain('\u001B[');
  });
});

describe('GitHub annotations', () => {
  it('formats a workflow command with the location and chain', () => {
    expect(annotation(chokidar)).toBe(
      '::error file=node_modules/chokidar/index.js,line=5,col=3,title=edgefit%3A unsupported on workerd' +
        '::node:fs.watch is unsupported%0Ain chokidar@4.0.1%0Avia src/index.ts > chokidar',
    );
  });

  it('escapes special characters in properties and data', () => {
    const finding = makeFinding('x', {
      message: '50% done\nnext',
      location: { file: 'a,b:c.ts', line: 1, column: 1 },
    });
    const line = annotation(finding);
    expect(line).toContain('file=a%2Cb%3Ac.ts');
    expect(line).toContain('50%25 done%0Anext');
  });

  it('ends the report with the summary', () => {
    expect(
      formatGithub(resultOf([chokidar]))
        .trimEnd()
        .split('\n')
        .at(-1),
    ).toBe('edgefit: 1 error, 0 warnings');
  });
});

describe('guarded findings', () => {
  const guarded = makeFinding('node:fs.watch', { guarded: true });

  it('are counted but left out of the list and the summary', () => {
    const text = formatText(resultOf([], 0, [guarded]), { color: false });
    expect(text).toContain('No known incompatible reachable APIs found.');
    expect(text).toContain('1 guarded usage hidden');
    expect(text).toContain('Run with --verbose');
    expect(text).toContain('0 errors, 0 warnings');
    expect(text).not.toContain('node:fs.watch');
  });

  it('are listed with --verbose', () => {
    const text = formatText(resultOf([], 0, [guarded]), { color: false, verbose: true });
    expect(text).toContain('Guarded: the code checks for an API this target lacks or may lack');
    expect(text).toContain('guarded  unsupported  node:fs.watch');
    expect(text).toContain('0 errors, 0 warnings');
  });

  it('say why a listed case is not reached, with --verbose and in the JSON report', () => {
    const unreached = {
      reason: 'Only used with Cache Components.',
      source: 'https://example.com/why',
    };
    const listed = makeFinding('node:fs.watch', { guarded: true, unreached });
    const text = formatText(resultOf([], 0, [listed]), { color: false, verbose: true });
    expect(text).toContain('not reached: Only used with Cache Components.');
    expect(text).toContain('see https://example.com/why');
    expect(JSON.stringify(JSON.parse(formatJson(resultOf([], 0, [listed]))))).toContain(
      'Only used with Cache Components.',
    );
  });

  it('are in the JSON report next to the findings', () => {
    const report = JSON.parse(formatJson(resultOf([], 0, [guarded]))) as {
      summary: { errors: number };
      targets: { guarded: { api: string; guarded: boolean }[] }[];
    };
    expect(report.summary.errors).toBe(0);
    expect(report.targets[0]?.guarded).toMatchObject([{ api: 'node:fs.watch', guarded: true }]);
  });
});

const unknown = (api: string, parts: Parameters<typeof makeFinding>[1] = {}): Finding =>
  makeFinding(api, {
    category: 'unknown',
    level: 'warning',
    detail: 'cannot be checked statically: accessed with a computed property',
    ...parts,
  });

describe('unknown findings', () => {
  const owner = { name: 'better-auth', version: '1.7.6' };
  const many = [
    unknown('globalThis[<expression>]', {
      package: owner,
      otherLocations: [
        { file: 'a.js', line: 1, column: 1 },
        { file: 'a.js', line: 2, column: 1 },
      ],
    }),
    unknown('import(<expression>)', { package: owner }),
    unknown('globalThis[<expression>]', {
      package: { name: 'vue', version: '3.5.0' },
      location: { file: 'node_modules/vue/index.js', line: 4, column: 2 },
    }),
  ];

  it('are folded into one line per package, with counts', () => {
    const text = formatText(resultOf(many), { color: false });
    expect(text).toContain(
      'better-auth@1.7.6  4 accesses that cannot be checked: globalThis[<expression>] (3), import(<expression>) (1)',
    );
    expect(text).toContain(
      'vue@3.5.0  1 access that cannot be checked: globalThis[<expression>] (1)',
    );
    expect(text).toContain('Run with --verbose for the locations.');
    expect(text).not.toContain('node_modules/vue/index.js');
  });

  it('are listed in full with --verbose', () => {
    const text = formatText(resultOf(many), { color: false, verbose: true });
    expect(text).toContain('node_modules/vue/index.js:4:2');
    expect(text).not.toContain('that cannot be checked');
  });
});

describe('unknown findings next to others', () => {
  it('keep the details of errors and of other warnings', () => {
    const text = formatText(resultOf([chokidar, makeFinding('node:fs.cp', { level: 'warning' })]), {
      color: false,
    });
    expect(text).toContain('node_modules/chokidar/index.js:5:3');
    expect(text).toContain('warning  unsupported  node:fs.cp');
    expect(text).not.toContain('cannot be checked');
  });

  it('stay in full when the user made them errors', () => {
    const text = formatText(resultOf([unknown('import(<expression>)', { level: 'error' })]), {
      color: false,
    });
    expect(text).toContain('error    unknown  import(<expression>)');
  });

  it('are still counted as warnings in the summary', () => {
    expect(summaryLine(resultOf([unknown('import(<expression>)')]))).toBe('0 errors, 1 warning');
  });
});

describe('pnpm store paths', () => {
  const at = (file: string, name: string): Finding =>
    makeFinding('node:fs.watch', {
      package: { name, version: '1.0.0' },
      location: { file, line: 2, column: 1 },
    });
  const store = '../node_modules/.pnpm/chokidar@4.0.3/node_modules/chokidar/esm/handler.js';

  it('are shown as the package path in the text report', () => {
    const text = formatText(resultOf([at(store, 'chokidar')]), { color: false });
    expect(text).toContain('node_modules/chokidar/esm/handler.js:2:1');
    expect(text).not.toContain('.pnpm');
  });

  it('are shortened for scoped packages too', () => {
    const scoped =
      'node_modules/.pnpm/@hono+zod-validator@0.9.1_zod@4.6.5/node_modules/@hono/zod-validator/index.js';
    const text = formatText(resultOf([at(scoped, '@hono/zod-validator')]), { color: false });
    expect(text).toContain('node_modules/@hono/zod-validator/index.js:2:1');
  });

  it('are kept as they are in the JSON report', () => {
    expect(formatJson(resultOf([at(store, 'chokidar')]))).toContain('.pnpm/chokidar@4.0.3');
  });
});

describe('guarded findings that need an option', () => {
  it('name the option that the code needs, with --verbose and in the JSON report', () => {
    const listed = makeFinding('node:http2.createServer', { guarded: true, options: ['http2'] });
    const text = formatText(resultOf([], 0, [listed]), { color: false, verbose: true });
    expect(text).toContain('runs only when the option `http2` is set');
    expect(formatJson(resultOf([], 0, [listed]))).toContain('"options"');
  });

  it('name two options with "and"', () => {
    const two = makeFinding('node:http2.createServer', { guarded: true, options: ['a', 'b'] });
    expect(formatText(resultOf([], 0, [two]), { color: false, verbose: true })).toContain(
      'runs only when the options `a` and `b` are set',
    );
  });
});
