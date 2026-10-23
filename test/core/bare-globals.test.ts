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

const withData = ['workerd', 'bun', 'deno', 'netlify-edge', 'vercel-edge'] as const;

describe('a read of a browser global by its bare name that runs as the module loads', () => {
  it.each(withData)('is a finding on %s', async target => {
    const [findings] = await reported('load.mjs', target);
    expect(findings).toEqual(['document.implementation.createDocument']);
  });

  it.each(withData)('is a finding on %s when only a check reads the name', async target => {
    const [findings] = await reported('check.mjs', target);
    expect(findings).toEqual(['document']);
  });

  it.each(withData)('is guarded on %s behind a typeof guard clause', async target => {
    const [findings, guarded] = await reported('guard-clause.mjs', target);
    expect(findings).toEqual([]);
    expect(guarded).toEqual(['document.title']);
  });

  it('is a finding for Bun on workerd, where Bun is missing', async () => {
    const [findings] = await reported('bun-read.mjs', 'workerd');
    expect(findings).toEqual(['Bun']);
    expect((await reported('bun-read.mjs', 'bun'))[0]).toEqual([]);
  });
});

describe('a read of a browser global after the file sets it', () => {
  it.each(withData)('is no finding on %s', async target => {
    const [findings] = await reported('shim.mjs', target);
    expect(findings).toEqual([]);
  });
});

describe('a read of a browser global when only a function sets it', () => {
  it.each(withData)('is a finding on %s, because the function may never run', async target => {
    const [findings] = await reported('shim-in-function.mjs', target);
    expect(findings).toEqual(['document.title']);
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

describe('a read of a DOM global by its bare name', () => {
  it.each([
    ['workerd', ['DOMParser', 'localStorage.getItem']],
    ['vercel-edge', ['DOMParser', 'localStorage.getItem']],
    ['deno', ['DOMParser']],
    ['bun', ['DOMParser', 'localStorage.getItem']],
  ] as const)('at load is a finding on %s only for a global it lacks', async (target, expected) => {
    const [findings] = await reported('dom-load.mjs', target);
    expect(findings).toEqual(expected);
  });

  it.each(withData)('in a function or behind a typeof check is no finding on %s', async target => {
    const [findings, guarded] = await reported('dom-lazy.mjs', target);
    expect(findings).toEqual([]);
    expect(guarded).toEqual([]);
  });

  it.each(withData)('through the global object is no finding on %s', async target => {
    const [findings] = await reported('dom-global-object.mjs', target);
    expect(findings).toEqual([]);
  });

  it('names the missing global when the code reads a member of it', async () => {
    const { reports } = await check({
      root: fixture('bare-globals-app'),
      config: { targets: ['bun'], entry: 'dom-member.mjs' },
    });
    expect(reports[0]?.findings.map(finding => finding.message)).toEqual([
      'window.scroll needs the window global, which the target does not have, so a read of it throws a ReferenceError',
    ]);
  });

  it('guards the code after a check of a missing global, whatever the code reads', async () => {
    const [findings, guarded] = await reported('audio-guard.mjs', 'workerd');
    expect(findings).toEqual([]);
    expect(guarded).toEqual(['URL.createObjectURL']);
    expect((await reported('audio-guard.mjs', 'bun'))[1]).toEqual([]);
  });
});
