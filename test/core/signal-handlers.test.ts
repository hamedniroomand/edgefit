import { describe, expect, it } from 'vite-plus/test';

import { check } from '@/core/check.ts';
import type { TargetKey } from '@/types.ts';
import { fixture } from '~/helpers.ts';

const fork = 'node:cluster.fork';
const withoutSignals = ['workerd', 'vercel-edge'] as const;
const withSignals = ['netlify-edge', 'deno-deploy', 'bun'] as const;

/** What `check` reports for `cluster.fork` in an entry of the fixture, by target. */
async function reports(
  entry: string,
): Promise<Record<string, { found: boolean; guarded: boolean }>> {
  const result = await check({
    root: fixture('signal-handler-app'),
    config: {
      targets: [...withoutSignals, ...withSignals] satisfies TargetKey[],
      entry,
      workerd: { wranglerConfig: false },
    },
  });
  return Object.fromEntries(
    result.reports.map(report => [
      report.target.key,
      {
        found: report.findings.some(finding => finding.api === fork),
        guarded: report.guarded.some(finding => finding.api === fork),
      },
    ]),
  );
}

describe('a handler of a signal, for each target', () => {
  it.each(['inline', 'named', 'removal', 'node-process'])(
    'guards what the handler in %s.mjs uses where no signal arrives',
    async name => {
      const found = await reports(`${name}.mjs`);
      for (const target of withoutSignals) {
        expect(found[target]).toEqual({ found: false, guarded: true });
      }
    },
  );

  it.each(['inline', 'named', 'removal', 'node-process'])(
    'keeps what the handler in %s.mjs uses where a signal can arrive',
    async name => {
      const found = await reports(`${name}.mjs`);
      for (const target of withSignals) {
        expect(found[target]).toEqual({ found: true, guarded: false });
      }
    },
  );

  it.each(['also-called', 'other-event', 'call-handler', 'exported'])(
    'keeps what %s.mjs uses on every target',
    async name => {
      const found = await reports(`${name}.mjs`);
      for (const target of [...withoutSignals, ...withSignals]) {
        expect(found[target]).toEqual({ found: true, guarded: false });
      }
    },
  );
});
