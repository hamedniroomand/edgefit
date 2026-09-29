import { describe, expect, it } from 'vite-plus/test';

import { jsonReportVersion, parseJsonReport } from '@/report/json.ts';

const valid = { version: jsonReportVersion, targets: [{ key: 'workerd', findings: [] }] };

describe('reading JSON reports', () => {
  it('reads back a report', () => {
    expect(parseJsonReport(JSON.stringify(valid), 'base.json')).toEqual(valid);
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
