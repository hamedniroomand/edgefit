import { describe, expect, it } from 'vite-plus/test';

import { findingId } from '@/report/finding-id.ts';
import { jsonReportVersion, parseJsonReport } from '@/report/json.ts';
import { makeFinding } from '~/helpers.ts';

const valid = {
  version: jsonReportVersion,
  skipped: [],
  targets: [{ key: 'workerd', entries: ['src/index.ts'], findings: [] }],
};

describe('reading JSON reports', () => {
  it('reads back a report', () => {
    expect(parseJsonReport(JSON.stringify(valid), 'base.json')).toEqual(valid);
  });

  it('reads a version 1 report, mapping its entry to entries', () => {
    const v1 = { version: 1, targets: [{ key: 'workerd', entry: 'src/index.ts', findings: [] }] };
    expect(parseJsonReport(JSON.stringify(v1), 'base.json').targets).toEqual([
      { key: 'workerd', entries: ['src/index.ts'], findings: [] },
    ]);
    expect(parseJsonReport(JSON.stringify(v1), 'base.json').skipped).toEqual([]);
  });

  it('rejects text that is not JSON', () => {
    expect(() => parseJsonReport('{', 'base.json')).toThrow('base.json is not valid JSON.');
  });

  it.each([['null'], ['[]'], ['{"targets":{}}'], ['{"targets":[{}]}']])(
    'rejects %s as not a report',
    text => {
      expect(() => parseJsonReport(text, 'base.json')).toThrow(
        'base.json is not an edgefit JSON report.',
      );
    },
  );

  it('rejects a report of another version', () => {
    expect(() => parseJsonReport(JSON.stringify({ ...valid, version: 99 }), 'head.json')).toThrow(
      'head.json has report version 99',
    );
  });
});

describe('finding IDs in a report that is read back', () => {
  const finding = makeFinding('node:fs.watch');
  const read = (value: object): string | undefined => {
    const [first] = parseJsonReport(JSON.stringify(value), 'base.json').targets[0]?.findings ?? [];
    return (first as { id?: string } | undefined)?.id;
  };

  it('adds the ID to a finding from a report written before IDs existed', () => {
    const old = { version: 1, targets: [{ key: 'workerd', entry: 'a.ts', findings: [finding] }] };
    expect(read(old)).toBe(findingId(finding));
  });

  it('keeps the ID that the report has', () => {
    const withId = {
      ...valid,
      targets: [{ ...valid.targets[0], findings: [{ ...finding, id: 'ef_0000000000' }] }],
    };
    expect(read(withId)).toBe('ef_0000000000');
  });
});
