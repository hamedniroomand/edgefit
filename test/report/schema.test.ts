import { readFileSync } from 'node:fs';

import { Ajv } from 'ajv';
import { describe, expect, it } from 'vite-plus/test';

import type { CheckResult } from '@/core/check.ts';
import { check } from '@/core/check.ts';
import { formatJson } from '@/report/json.ts';
import { fixture, makeFinding } from '~/helpers.ts';

const schema = JSON.parse(readFileSync('docs/public/schema/report-v2.json', 'utf8')) as object;
const validate = new Ajv({ strict: true }).compile(schema);

/** The published schema allows unknown fields. This copy rejects them, so a new field fails the test. */
function strict(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(item => strict(item));
  }
  if (typeof node !== 'object' || node === null) {
    return node;
  }
  const copy = Object.fromEntries(Object.entries(node).map(([key, value]) => [key, strict(value)]));
  return 'properties' in copy ? { ...copy, additionalProperties: false } : copy;
}
const validateStrict = new Ajv({ strict: true }).compile(strict(schema) as object);

type Report = { targets: { findings: Record<string, unknown>[] }[] };

function reportOf(findings: CheckResult['reports'][number]['findings']): Report {
  return JSON.parse(formatJson(resultOf(findings))) as Report;
}

const full = makeFinding('node:fs.watch', {
  package: { name: 'chokidar', version: '4.0.1' },
  otherLocations: [{ file: 'node_modules/chokidar/other.js', line: 1, column: 1 }],
  source: 'https://example.com/fs',
  buildOutput: true,
  suggestion: {
    kind: 'setting',
    text: 'Set the date.',
    setting: { name: 'compatibility_date', value: '2025-09-15', remove: true },
    target: 'workerd',
    source: 'https://example.com/date',
  },
});
const guarded = makeFinding('node:fs.watch', {
  level: 'warning',
  guarded: true,
  unreached: { reason: 'not run', source: 'https://example.com/run' },
});

function resultOf(findings: CheckResult['reports'][number]['findings']): CheckResult {
  return {
    root: '/project',
    skipped: [{ key: 'bun', searched: ['bunfig.toml'] }],
    reports: [
      {
        target: {
          key: 'workerd',
          platform: 'Cloudflare Workers',
          conditions: ['workerd'],
          data: 'matrix@abc1234',
          settings: 'compat date 2026-04-24',
          notes: [],
        },
        entries: ['src/index.ts'],
        modules: 3,
        findings,
        guarded: [guarded],
        ignored: 0,
        supported: [],
      },
    ],
  };
}

describe('the JSON report schema', () => {
  it.each([
    ['a report with every field set', [full]],
    ['a report with the fewest fields', [makeFinding('node:fs.watch')]],
    ['a report with no findings', []],
  ])('accepts %s', (_name, findings) => {
    const report = reportOf(findings);
    const ok = validateStrict(report);
    expect(validateStrict.errors).toBeNull();
    expect(ok).toBe(true);
    expect(validate(report)).toBe(true);
  });

  it.each([
    ['a project with build output', { root: fixture('nitro-libs') }],
    ['a project built with sourcemaps', { root: fixture('nitro-app'), built: '.output/server' }],
    ['a project with suggestions', { root: fixture('worker') }],
  ])('accepts a report from %s', async (_name, options) => {
    const result = await check(options);
    const report = JSON.parse(formatJson(result)) as Report;
    expect(report.targets.flatMap(target => target.findings).length).toBeGreaterThan(0);
    const ok = validateStrict(report);
    expect(validateStrict.errors).toBeNull();
    expect(ok).toBe(true);
  });

  it('allows a field that the schema does not list', () => {
    const report = reportOf([full]);
    for (const finding of report.targets.flatMap(target => target.findings)) {
      finding.extra = true;
    }
    expect(validate(report)).toBe(true);
    expect(validateStrict(report)).toBe(false);
  });

  it('rejects a finding without an ID', () => {
    const report = reportOf([full]);
    for (const finding of report.targets.flatMap(target => target.findings)) {
      delete finding.id;
    }
    expect(validate(report)).toBe(false);
  });
});
