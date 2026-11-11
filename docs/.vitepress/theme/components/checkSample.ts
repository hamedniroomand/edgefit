// Copied from the output of `edgefit check --no-color` (edgefit 0.16.4) for the sample project of the home page:
// an entry that imports hono, chokidar and cross-spawn. `fails` says if node:fs.watch and node:child_process.spawn fail.
export const CHECK_SAMPLE = {
  workerd: {
    head: [
      'edgefit · workerd (Cloudflare Workers)',
      '  entry src/index.ts · 47 modules · conditions workerd, worker, browser',
    ],
    findings: [
      [
        'error    unsupported  node:fs.watch  (workerd)',
        '       file watching is not implemented; throws ERR_UNSUPPORTED_OPERATION',
        '       chokidar@6.0.0  node_modules/chokidar/backend.js:1:10',
        '       via src/index.ts > chokidar',
      ],
      [
        'error    unsupported  node:child_process.spawn  (workerd)',
        '       every child_process function throws ERR_METHOD_NOT_IMPLEMENTED; Workers cannot spawn processes',
        '       cross-spawn@7.0.6  node_modules/cross-spawn/index.js:12:24',
        '       via src/index.ts > cross-spawn',
      ],
    ],
    hidden: 1,
    clean: null,
    summary: '3 errors, 0 warnings',
    fails: [true, true],
  },
  bun: {
    head: ['edgefit · bun (Bun)', '  entry src/index.ts · 47 modules · conditions bun, node'],
    findings: [],
    hidden: 0,
    clean: 'No known incompatible reachable APIs found.',
    summary: '0 errors, 0 warnings',
    fails: [false, false],
  },
  deno: {
    head: ['edgefit · deno (Deno)', '  entry src/index.ts · 47 modules · conditions deno, node'],
    findings: [],
    hidden: 0,
    clean: 'No known incompatible reachable APIs found.',
    summary: '0 errors, 0 warnings',
    fails: [false, false],
  },
  'netlify-edge': {
    head: [
      'edgefit · netlify-edge (Netlify Edge Functions)',
      '  entry src/index.ts · 47 modules · conditions node',
    ],
    findings: [
      [
        'error    unsupported  node:child_process.spawn  (netlify-edge)',
        '       Netlify does not grant run access: starting a subprocess throws NotCapable',
        '       cross-spawn@7.0.6  node_modules/cross-spawn/index.js:12:24',
        '       via src/index.ts > cross-spawn',
      ],
    ],
    hidden: 1,
    clean: null,
    summary: '2 errors, 0 warnings',
    fails: [false, true],
  },
  'vercel-edge': {
    head: [
      'edgefit · vercel-edge (Vercel Edge)',
      '  entry src/index.ts · 47 modules · conditions edge-light, module',
    ],
    findings: [
      [
        'error    unsupported  node:fs.watch  (vercel-edge)',
        '       does not exist on the target',
        '       chokidar@6.0.0  node_modules/chokidar/backend.js:121:12  (+1 more)',
        '       via src/index.ts > chokidar',
      ],
      [
        'error    unsupported  node:child_process.spawn  (vercel-edge)',
        '       is not available in the Edge runtime: only events, buffer, assert, async_hooks and util can be imported',
        '       cross-spawn@7.0.6  node_modules/cross-spawn/index.js:12:24',
        '       via src/index.ts > cross-spawn',
      ],
    ],
    hidden: 33,
    clean: null,
    summary: '35 errors, 0 warnings',
    fails: [true, true],
  },
} as const;
