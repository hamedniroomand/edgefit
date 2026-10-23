import { describe, expect, it } from 'vite-plus/test';

import { domGlobalsProvider } from '@/data/providers/dom-globals.ts';

import { dataDirectoryWith } from './data-fixture.ts';

const dataDirectory = dataDirectoryWith({
  'source.json': {
    sources: [
      {
        provider: 'dom-globals',
        url: 'https://example.com/dom',
        license: 'Apache-2.0',
        versions: { typescript: '5.9.3' },
      },
    ],
  },
  'dom-globals.json': {
    names: ['DOMParser', 'alert', 'window'],
    presentOn: { deno: ['alert'], netlify: ['alert', 'window'] },
  },
});

function pathsOf(entries: { path: string[] }[]): (string | undefined)[] {
  return entries.map(entry => entry.path[0]);
}

describe('DOM globals provider', () => {
  it('lists each name that the column of the runtime does not have', () => {
    const entries = domGlobalsProvider('deno').load(dataDirectory);
    expect(pathsOf(entries)).toEqual(['DOMParser', 'window']);
  });

  it('reads the column of the platform when it has one', () => {
    const entries = domGlobalsProvider('deno', 'netlify').load(dataDirectory);
    expect(pathsOf(entries)).toEqual(['DOMParser']);
  });

  it('lists every name for a runtime that has no column', () => {
    const entries = domGlobalsProvider('workerd').load(dataDirectory);
    expect(pathsOf(entries)).toEqual(['DOMParser', 'alert', 'window']);
  });

  it('marks each name as absent and read only at load, with its source', () => {
    const [entry] = domGlobalsProvider('workerd').load(dataDirectory);
    expect(entry).toMatchObject({
      target: 'workerd',
      module: '*globals*',
      status: 'unsupported',
      absent: true,
      loadOnly: true,
      source: {
        provider: 'dom-globals',
        version: 'typescript 5.9.3',
        url: 'https://example.com/dom',
      },
    });
  });
});
