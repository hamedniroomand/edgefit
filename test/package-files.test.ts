import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vite-plus/test';

it('publishes only dist, data and the report schema, never the sample apps or fixtures', () => {
  const file = path.join(import.meta.dirname, '../package.json');
  const { files } = JSON.parse(readFileSync(file, 'utf8')) as { files: string[] };
  expect(files).toEqual(['dist', 'data', 'docs/public/schema/report-v2.json']);
});
