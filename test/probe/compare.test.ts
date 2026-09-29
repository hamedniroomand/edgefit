import { compareOutcomes } from '@scripts/probe/compare.mjs';
import { describe, expect, it } from 'vite-plus/test';

const override = (status: string): { status: string; note: string; source: string } => ({
  status,
  note: '',
  source: '',
});

describe('compareOutcomes', () => {
  it('lists an unsupported override that the probe found implemented', () => {
    expect(
      compareOutcomes(
        { 'v8.takeCoverage': 'implemented' },
        { 'v8.takeCoverage': override('unsupported') },
        {},
      ),
    ).toEqual([
      { api: 'v8.takeCoverage', message: 'override says `unsupported`, probe says `implemented`' },
    ]);
  });

  it('accepts a stub the probe found missing or unsupported', () => {
    const overrides = { 'a.x': override('unsupported'), 'a.y': override('unsupported') };
    expect(compareOutcomes({ 'a.x': 'missing', 'a.y': 'unsupported' }, overrides, {})).toEqual([]);
  });

  it('lists a mocked override that the probe found missing', () => {
    expect(compareOutcomes({ 'a.x': 'missing' }, { 'a.x': override('mocked') }, {})).toHaveLength(
      1,
    );
  });

  it('reports matrix disagreements only for APIs without an override', () => {
    const matrix = { a: { x: 'function' } };
    expect(compareOutcomes({ 'a.x': 'missing', 'a.y': 'implemented' }, {}, matrix)).toEqual([
      { api: 'a.x', message: 'matrix says `present`, probe says `missing`' },
      { api: 'a.y', message: 'matrix says `missing`, probe says `implemented`' },
    ]);
    expect(
      compareOutcomes({ 'a.x': 'missing' }, { 'a.x': override('unsupported') }, matrix),
    ).toEqual([]);
  });

  it('ignores a denied API that exists', () => {
    expect(
      compareOutcomes(
        { 'process.kill': 'inconclusive' },
        { 'process.kill': override('unsupported') },
        {},
      ),
    ).toEqual([]);
  });
});
