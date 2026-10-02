// `node witness/build.mjs <netlify|vercel> <directory>` writes a project that the platform's CLI
// can deploy. The CLIs upload only the project directory, so the probe code is copied into it.
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { witnessSpec } from './spec.mjs';

const probe = path.join(import.meta.dirname, '..');

/** Files the platform reads its configuration from, which must be in the project itself. */
const projects = {
  netlify: {
    'netlify.toml': `[build]
  publish = "public"

[[edge_functions]]
  function = "witness"
  path = "/"
`,
    'public/robots.txt': 'User-agent: *\nDisallow: /\n',
    'netlify/edge-functions/witness.mjs':
      "export { default } from '../../lib/witness/netlify.mjs';\n",
  },
  vercel: {
    'package.json': '{ "type": "module", "private": true }\n',
    'robots.txt': 'User-agent: *\nDisallow: /\n',
    'middleware.js': `import { handle } from './lib/witness/vercel.mjs';

export const config = { matcher: '/middleware', runtime: 'edge' };

export default () => handle('middleware');
`,
    'api/witness.js': `import { handle } from '../lib/witness/vercel.mjs';

export const config = { runtime: 'edge' };

export default () => handle('edge-function');
`,
  },
};

const libraries = ['probe.mjs', 'classify.mjs', 'witness/checks.mjs', 'witness/handler.mjs'];

export function build(platform, directory) {
  const files = {
    ...projects[platform],
    'lib/witness/spec-data.mjs': `export default ${JSON.stringify(witnessSpec(platform))};\n`,
  };
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    writeFileSync(path.join(directory, file), text);
  }
  for (const file of [...libraries, `witness/${platform}.mjs`]) {
    mkdirSync(path.dirname(path.join(directory, 'lib', file)), { recursive: true });
    copyFileSync(path.join(probe, file), path.join(directory, 'lib', file));
  }
}

if (process.argv[1] === import.meta.filename) {
  const [platform, directory] = process.argv.slice(2);
  build(platform, directory);
}
