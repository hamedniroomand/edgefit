import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import type { TargetKey } from '@/types.ts';
import { fixture } from '~/helpers.ts';

/** The APIs that `check` reports for an entry of the fixture, and the ones it guards, on one target. */
async function reported(entry: string, target: TargetKey): Promise<[string[], string[]]> {
  const { reports } = await check({
    root: fixture('bare-globals-app'),
    config: { targets: [target], entry, workerd: { wranglerConfig: false } },
  });
  const [report] = reports;
  return [
    (report?.findings ?? []).map(finding => finding.api),
    (report?.guarded ?? []).map(finding => finding.api),
  ];
}

const withData = ['workerd', 'netlify-edge'] as const;

describe('a read of a browser global by its bare name that runs as the module loads', () => {
  it.each(withData)('is a finding on %s', async target => {
    const [findings] = await reported('load.mjs', target);
    expect(findings).toEqual(['document.implementation.createDocument']);
  });

  it.each(withData)('is a finding on %s when only a check reads the name', async target => {
    const [findings] = await reported('check.mjs', target);
    expect(findings).toEqual(['document']);
  });

  it.each(['workerd', 'netlify-edge'] as const)(
    'is guarded on %s behind a typeof guard clause',
    async target => {
      const [findings, guarded] = await reported('guard-clause.mjs', target);
      expect(findings).toEqual([]);
      expect(guarded).toEqual(['document.title']);
    },
  );

  it('is a finding for Bun on workerd, where Bun is missing', async () => {
    const [findings] = await reported('bun-read.mjs', 'workerd');
    expect(findings).toEqual(['Bun']);
    expect((await reported('bun-read.mjs', 'bun'))[0]).toEqual([]);
  });

  it('is no finding on a target whose data does not list the global as missing', async () => {
    const results = await Promise.all(
      (['bun', 'deno'] as const).map(async target => (await reported('load.mjs', target))[0]),
    );
    expect(results).toEqual([[], []]);
  });
});

describe('a read of a browser global after the file sets it', () => {
  it.each(withData)('is no finding on %s', async target => {
    const [findings] = await reported('shim.mjs', target);
    expect(findings).toEqual([]);
  });
});

describe('a check of a missing global that the data does not mark as read at load', () => {
  it.each(['workerd', 'bun'] as const)(
    'is no finding in a function on %s, as before',
    async target => {
      const [findings] = await reported('other-globals.mjs', target);
      expect(findings).toEqual([]);
    },
  );
});

describe('a read of a browser global that does not run as the module loads', () => {
  it.each(withData)('is no finding by its bare name on %s', async target => {
    const [findings] = await reported('lazy.mjs', target);
    expect(findings).toEqual([]);
  });

  it('is not listed as a supported API', async () => {
    const { reports } = await check({
      root: fixture('bare-globals-app'),
      config: { targets: ['workerd'], entry: 'lazy.mjs', workerd: { wranglerConfig: false } },
      includeSupported: true,
    });
    expect(reports[0]?.supported.map(item => item.api)).toEqual([]);
  });

  it('is a finding through the global object, wherever it is', async () => {
    const [findings] = await reported('global-this.mjs', 'workerd');
    expect(findings).toEqual(['document.title']);
  });
});
