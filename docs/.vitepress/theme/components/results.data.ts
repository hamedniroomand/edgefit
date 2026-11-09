import { readFileSync } from 'node:fs';

import { defineLoader } from 'vitepress';

declare const data: unknown;
export { data };

// The Docs workflow fetches the weekly results into this file before the build. A local build may not have it.
// The loader output goes through JSON.stringify, so the empty state must be null, not undefined.
export default defineLoader({
  watch: ['../../../public/packages/results.json'],
  load: ([file]: string[]): unknown =>
    file === undefined ? null : JSON.parse(readFileSync(file, 'utf8')),
});
