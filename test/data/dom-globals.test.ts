import { describe, expect, it } from 'vite-plus/test';

import { findDataDirectory, readDataFile } from '@/data/data-directory.ts';

type DomGlobals = { names: string[]; presentOn: Record<string, string[]> };

const data = readDataFile<DomGlobals>(findDataDirectory(), 'dom-globals.json');

describe('the DOM globals data', () => {
  it('holds lists of strings', () => {
    const lists = [data.names, ...Object.values(data.presentOn)];
    expect(lists.every(list => list.every(name => typeof name === 'string'))).toBe(true);
  });

  it('lists each name once, and in order', () => {
    expect(data.names).toEqual([...new Set(data.names)].sort());
  });

  it('lists a name that a column has only when the name is in the list', () => {
    const names = new Set(data.names);
    const unknown = Object.values(data.presentOn)
      .flat()
      .filter(name => !names.has(name));
    expect(unknown).toEqual([]);
  });

  it('keeps out a name that every object has', () => {
    expect(data.names).not.toContain('toString');
  });

  it('keeps window on Netlify, where the production witness lists it', () => {
    expect(data.presentOn.netlify).toContain('window');
    expect(data.presentOn.deno).not.toContain('window');
  });

  it('has a column for workerd, Bun, Deno and Netlify, and none for Vercel Edge', () => {
    expect(Object.keys(data.presentOn).sort()).toEqual(['bun', 'deno', 'netlify', 'workerd']);
  });
});
