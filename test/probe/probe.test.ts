import process from 'node:process';

import { probeApi, probeApis } from '@scripts/probe/probe.mjs';
import { describe, expect, it, vi } from 'vite-plus/test';

describe('probeApis under Node', () => {
  it('reports implemented and inconclusive APIs, never unsupported', async () => {
    const outcomes = await probeApis([
      { api: 'fs.readFile' },
      { api: 'path.basename' },
      { api: 'events.EventEmitter', kind: 'class' },
      { api: 'os.platform' },
    ]);
    expect(outcomes).toEqual({
      'fs.readFile': 'implemented',
      'path.basename': 'implemented',
      'events.EventEmitter': 'inconclusive',
      'os.platform': 'inconclusive',
    });
  });

  it('reports a missing module or member as missing', async () => {
    expect(await probeApi({ api: 'fs.noSuchMember' })).toBe('missing');
    expect(await probeApi({ api: 'noSuchModule.thing' })).toBe('missing');
  });

  it('only looks up a denied API', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((): never => {
      throw new Error('called');
    });
    expect(await probeApi({ api: 'process.exit' })).toBe('inconclusive');
    expect(exit).not.toHaveBeenCalled();
    exit.mockRestore();
  });
});
