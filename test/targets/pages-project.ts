import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const pagesConfig = '{ "name": "app", "pages_build_output_dir": "dist" }';

export const worker = 'export default { fetch: () => new Response("ok") };\n';

/** A Pages project in a temporary folder. A name that ends with `/` is an empty folder. */
export function project(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'edgefit-pages-'));
  for (const [name, text] of Object.entries({ 'wrangler.jsonc': pagesConfig, ...files })) {
    if (name.endsWith('/')) {
      mkdirSync(path.join(root, name), { recursive: true });
    } else {
      mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
      writeFileSync(path.join(root, name), text);
    }
  }
  return root;
}
