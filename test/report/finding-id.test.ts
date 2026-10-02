import { describe, expect, it } from 'vite-plus/test';

import { findingId } from '@/report/finding-id.ts';
import type { Finding } from '@/types.ts';
import { makeFinding } from '~/helpers.ts';

const chokidar = makeFinding('node:fs.watch', {
  package: { name: 'chokidar', version: '4.0.1' },
});

describe('finding IDs', () => {
  it('has the same ID in every run', () => {
    expect(findingId(chokidar)).toBe(findingId({ ...chokidar }));
    expect(findingId(chokidar)).toMatch(/^ef_[0-9a-f]{10}$/u);
  });

  it('keeps the ID when the version, line or detail changes', () => {
    const moved = {
      ...chokidar,
      package: { name: 'chokidar', version: '4.0.3' },
      location: { file: 'node_modules/chokidar/other.js', line: 90, column: 2 },
      detail: 'other words',
    };
    expect(findingId(moved)).toBe(findingId(chokidar));
  });

  it.each([
    ['target', { target: 'bun' as const }],
    ['category', { category: 'mocked' as const }],
    ['API', { api: 'node:fs.watchFile' }],
    ['package', { package: { name: 'readdirp', version: '4.0.1' } }],
  ])('changes the ID when the %s changes', (_name, change) => {
    expect(findingId({ ...chokidar, ...change })).not.toBe(findingId(chokidar));
  });

  it('uses the file as the owner of the project code', () => {
    const own = makeFinding('node:fs.watch');
    const other = makeFinding('node:fs.watch', {
      location: { file: 'src/other.ts', line: 1, column: 1 },
    });
    expect(findingId(own)).not.toBe(findingId(other));
  });

  it('keeps the ID of build output when the chunk name changes', () => {
    const chunk = (file: string): Finding =>
      makeFinding('node:fs.watch', {
        buildOutput: true,
        location: { file, line: 3, column: 1 },
      });
    expect(findingId(chunk('.output/server/chunks/nitro-a1b2c3.mjs'))).toBe(
      findingId(chunk('.output/server/chunks/nitro-d4e5f6.mjs')),
    );
    expect(findingId(chunk('.output/server/chunks/nitro-a1b2c3.mjs'))).not.toBe(
      findingId(makeFinding('node:fs.watch', { location: chunk('x.mjs').location })),
    );
  });
});
