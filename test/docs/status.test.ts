import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

const root = path.join(import.meta.dirname, '../..');
const read = (file: string): string => readFileSync(path.join(root, file), 'utf8');

interface Source {
  provider: string;
  commit?: string;
  generatedAt?: string;
  versions: Record<string, string>;
  settings?: { workerd?: { compatibilityDate: string } };
}

const { sources } = JSON.parse(read('data/source.json')) as { sources: Source[] };
const source = (provider: string): Source => {
  const found = sources.find(entry => entry.provider === provider);
  if (found === undefined) {
    throw new Error(`data/source.json has no source named ${provider}`);
  }
  return found;
};

const matrix = source('workers-nodejs-compat-matrix');
const status = read('docs/guide/status.md');
const readme = read('README.md');

// These pages quote the data's versions. When the data moves, update them with it
// (docs/contributing/maintenance.md says where).
describe('the status page', () => {
  it('names the runtime versions in the data', () => {
    for (const runtime of ['workerd', 'bun', 'deno'] as const) {
      expect(status).toContain(matrix.versions[runtime]);
    }
  });

  it('names the compatibility date, the Node baseline and the matrix commit', () => {
    expect(status).toContain(matrix.settings?.workerd?.compatibilityDate);
    for (const version of (matrix.versions.node ?? '').split(', ')) {
      expect(status).toContain(version);
    }
    expect(status).toContain((matrix.commit ?? '').slice(0, 7));
  });

  it('names the date of the dumps, the Deno Deploy layer and the Web API data', () => {
    expect(status).toContain((matrix.generatedAt ?? '').slice(0, 10));
    expect(status).toContain(source('overrides/deno-deploy').versions['deno-deploy']);
    expect(status).toContain(`runtime-compat-data ${source('runtime-compat-data').versions.npm}`);
  });
});

describe('the README', () => {
  it('names the runtime versions in the data', () => {
    for (const runtime of ['workerd', 'bun', 'deno'] as const) {
      expect(readme).toContain(matrix.versions[runtime]);
    }
  });
});
