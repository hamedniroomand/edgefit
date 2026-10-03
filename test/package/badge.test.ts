import { describe, expect, it } from 'vite-plus/test';

import { badgeFileName, badgeMessage, renderBadge, shieldsEndpoint } from '@/package/badge.ts';
import type { PackageResult } from '@/package/result.ts';

const result: PackageResult = {
  version: 2,
  package: '@s/p',
  resolved: '1.0.0',
  checkedAt: '2026-01-01T00:00:00.000Z',
  edgefit: '0.5.0',
  data: {},
  targets: ['workerd', 'bun', 'deno'],
  summary: { workerd: 'pass', bun: 'warn', deno: 'fail' },
  context: {},
  entries: [],
};

describe('badge', () => {
  it('never shows a warning as a pass', () => {
    expect(badgeMessage(result)).toBe('workerd ✓ bun ⚠ deno ✗');
    expect(badgeMessage(result, { target: 'bun' })).toBe('bun ⚠');
  });

  it('renders one segment per target', () => {
    const svg = renderBadge(result);
    expect(svg).toContain('<svg');
    expect(svg).toContain('aria-label="edgefit: workerd ✓ bun ⚠ deno ✗"');
    expect(svg.match(/fill="#(?:3c9a5f|c99a1c|c8443b)"/gu)).toHaveLength(3);
  });

  it('writes shields endpoint JSON colored by the worst status', () => {
    expect(shieldsEndpoint(result)).toEqual({
      schemaVersion: 1,
      label: 'edgefit',
      message: 'workerd ✓ bun ⚠ deno ✗',
      color: 'red',
    });
    expect(shieldsEndpoint(result, { target: 'bun' })).toMatchObject({ color: 'yellow' });
  });

  it('flattens scoped names', () => {
    expect(badgeFileName('@s/p')).toBe('s__p');
    expect(badgeFileName('p')).toBe('p');
  });
});
