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
      {
        api: 'v8.takeCoverage',
        message: 'override says `unsupported`, probe says `implemented`',
        dataSaysPresent: false,
      },
    ]);
  });

  it('accepts a stub the probe found missing or unsupported', () => {
    const overrides = { 'a.x': override('unsupported'), 'a.y': override('unsupported') };
    expect(compareOutcomes({ 'a.x': 'missing', 'a.y': 'unsupported' }, overrides, {})).toEqual([]);
  });

  it('applies an override to the default mirror of its API', () => {
    const overrides = { 'fs.F_OK': override('supported') };
    const matrix = { fs: { F_OK: 'missing', default: { F_OK: 'missing' } } };
    expect(compareOutcomes({ 'fs.default.F_OK': 'present' }, overrides, matrix)).toEqual([]);
  });

  it('accepts a stub that a lookup found, but not an absent one', () => {
    const overrides = {
      'a.x': override('unsupported'),
      'a.y': { ...override('unsupported'), absent: true as const },
    };
    expect(compareOutcomes({ 'a.x': 'present', 'a.y': 'present' }, overrides, {})).toEqual([
      {
        api: 'a.y',
        message: 'override says `unsupported`, probe says `present`',
        dataSaysPresent: false,
      },
    ]);
  });

  it('lists a mocked override that the probe found missing', () => {
    expect(compareOutcomes({ 'a.x': 'missing' }, { 'a.x': override('mocked') }, {})).toHaveLength(
      1,
    );
  });
});

describe('compareOutcomes against the matrix', () => {
  it('reports matrix disagreements only for APIs without an override', () => {
    const matrix = { a: { x: 'function' } };
    expect(compareOutcomes({ 'a.x': 'missing', 'a.y': 'implemented' }, {}, matrix)).toEqual([
      { api: 'a.x', message: 'matrix says `present`, probe says `missing`', dataSaysPresent: true },
      {
        api: 'a.y',
        message: 'matrix says `missing`, probe says `implemented`',
        dataSaysPresent: false,
      },
    ]);
    expect(
      compareOutcomes({ 'a.x': 'missing' }, { 'a.x': override('unsupported') }, matrix),
    ).toEqual([]);
  });

  it('names runtime-compat-data for a Web API the matrix does not describe', () => {
    const webMissing = new Set(['*globals*.Cache']);
    expect(compareOutcomes({ '*globals*.Cache': 'present' }, {}, {}, webMissing)).toEqual([
      {
        api: '*globals*.Cache',
        message: 'runtime-compat-data says `missing`, probe says `present`',
        dataSaysPresent: false,
      },
    ]);
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

describe('compareOutcomes of an API that is missing on purpose', () => {
  it('accepts an API that is missing on purpose, and not one that works', () => {
    const harmless = { ...override('supported'), missingHarmless: true as const };
    expect(compareOutcomes({ 'a.x': 'missing' }, { 'a.x': harmless }, {})).toEqual([]);
    expect(
      compareOutcomes({ 'a.x': 'missing' }, { 'a.x': override('supported') }, {}),
    ).toHaveLength(1);
  });
});
