import { describe, expect, it } from 'vite-plus/test';

import { classify } from '@/core/classify.ts';
import type { LookupResult } from '@/data/dump.ts';
import { openOptions } from '@/targets/workerd/gates.ts';
import { makeUsage, stubTarget } from '~/helpers.ts';

const gate = {
  flag: 'throw_on_not_implemented_tls_options',
  disableFlag: 'no_throw_on_not_implemented_tls_options',
  date: '2026-06-16',
};
const connect: LookupResult = {
  status: 'mismatch',
  note: 'throws',
  options: ['ALPNProtocols', { key: 'checkServerIdentity', gate }],
};

/** The category of a call that passes `key`, at these settings. */
function categoryAt(key: string, date: string, flags: string[] = []): string | undefined {
  const settings = {
    compatibilityDate: date,
    compatibilityFlags: ['nodejs_compat', ...flags],
    origin: 'test',
  };
  const target = stubTarget({ 'tls.connect': openOptions(connect, settings) });
  const usage = makeUsage({ module: 'tls', path: ['connect'] }, { passedKeys: [{ key }] });
  return classify(usage, target)?.category;
}

describe('an option behind a workerd flag', () => {
  it('gives no finding before the date that turns the flag on', () => {
    expect(categoryAt('checkServerIdentity', '2026-06-15')).toBeUndefined();
  });

  it('gives the finding from that date', () => {
    expect(categoryAt('checkServerIdentity', '2026-06-16')).toBe('mismatch');
  });

  it('gives no finding when the disable flag turns it off', () => {
    const flags = ['no_throw_on_not_implemented_tls_options'];
    expect(categoryAt('checkServerIdentity', '2026-09-29', flags)).toBeUndefined();
  });

  it('gives the finding before the date when the enable flag turns it on', () => {
    const flags = ['throw_on_not_implemented_tls_options'];
    expect(categoryAt('checkServerIdentity', '2026-01-01', flags)).toBe('mismatch');
  });

  it('keeps an option without a gate at every date', () => {
    expect(categoryAt('ALPNProtocols', '2026-01-01')).toBe('mismatch');
  });

  it('leaves a result without options as it is', () => {
    const result: LookupResult = { status: 'supported' };
    const settings = { compatibilityDate: '2026-01-01', compatibilityFlags: [], origin: 'test' };
    expect(openOptions(result, settings)).toBe(result);
  });
});
