import { inRange, missingMembers, problemsOf, uses } from '@scripts/unreached/entries.mjs';
import { describe, expect, it } from 'vite-plus/test';

const text = 'var nativeProtocol = nativeProtocols[protocol]; nativeProtocol.request(options);';

describe('the weekly check of the data entries', () => {
  it('finds each member that the text holds', () => {
    expect(missingMembers(text, { members: ['request'] })).toEqual([]);
  });

  it('names a member that the text does not hold', () => {
    expect(missingMembers(text, { members: ['request', 'upgrade'] })).toEqual(['upgrade']);
    expect(problemsOf(text, { members: ['upgrade'] })).toEqual([
      'no longer holds the member upgrade.',
    ]);
  });

  it('names an API that the text does not use, for an unreached entry', () => {
    expect(problemsOf(text, { apis: ['node:fs.watch'] })).toEqual([
      'no longer uses node:fs.watch.',
    ]);
    expect(problemsOf(text, { apis: ['nativeProtocol.request'] })).toEqual([]);
  });

  it('reads a Node.js member that the code imports by name', () => {
    expect(uses("const { spawn } = require('child_process');", 'node:child_process.spawn')).toBe(
      true,
    );
    expect(uses("require('child_process');", 'node:child_process.spawn')).toBe(false);
  });

  it('reads a range without a max as open', () => {
    expect(inRange('9.0.0', { min: '1.14.0' })).toBe(true);
    expect(inRange('1.13.0', { min: '1.14.0' })).toBe(false);
    expect(inRange('1.17.0', { min: '1.14.0', max: '1.16.1' })).toBe(false);
  });
});
