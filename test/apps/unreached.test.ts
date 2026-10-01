import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { inRange, loadUnreached } from '@/data/unreached.ts';
import { sampleApp, sampleAppsInstalled } from '~/helpers.ts';

const installed = sampleAppsInstalled();

/** The text to look for in a file: the API as the code writes it. */
const needle = (api: string): string => api.replace(/^node:/u, '');

describe.skipIf(!installed)('data/unreached.json against the pinned packages', () => {
  const packageRoot = path.join(sampleApp('next-middleware'), 'node_modules/next');
  const entries = loadUnreached().filter(entry => entry.package === 'next');

  it('lists the pinned version of next in every range', () => {
    const { version } = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
      version: string;
    };
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(inRange(version, entry.versions)).toBe(true);
    }
  });

  it('names a file that exists in the package, and the APIs the file uses', () => {
    for (const entry of entries) {
      const file = path.join(packageRoot, entry.file);
      expect(existsSync(file), entry.file).toBe(true);
      const text = readFileSync(file, 'utf8');
      for (const api of entry.apis) {
        expect(text, `${entry.file} uses ${api}`).toContain(needle(api));
      }
    }
  });
});
