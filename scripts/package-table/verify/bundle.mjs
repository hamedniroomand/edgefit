// Bundles the entry for workerd, which loads one module and resolves no package on its own.
import { builtinModules } from 'node:module';
import path from 'node:path';

import { build } from 'esbuild';

const builtins = new Set(builtinModules.flatMap(name => [name, `node:${name}`]));

/**
 * An `import` of a builtin stays an external `node:` import. A `require()` of a builtin gets the
 * default export of the module, as Node gives it: without this, a class that extends a builtin
 * fails with "Class extends value #<Object>".
 */
const nodeBuiltins = {
  name: 'node-builtins',
  setup(builder) {
    // esbuild reads filters as Go regular expressions, which do not take the `u` flag.
    builder.onResolve({ filter: /.*/ }, args => {
      if (!builtins.has(args.path)) {
        return undefined;
      }
      const name = args.path.startsWith('node:') ? args.path : `node:${args.path}`;
      return args.kind === 'require-call' && args.namespace !== 'node-builtin'
        ? { path: name, namespace: 'node-builtin' }
        : { path: name, external: true };
    });
    builder.onLoad({ filter: /.*/, namespace: 'node-builtin' }, args => ({
      contents: `import builtin from ${JSON.stringify(args.path)};\nmodule.exports = builtin;`,
      loader: 'js',
    }));
  },
};

/** Bundles `<directory>/entry.mjs` to `<directory>/bundle.mjs`. Returns the error of a failed build. */
export async function bundle(directory) {
  try {
    await build({
      entryPoints: [path.join(directory, 'entry.mjs')],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      conditions: ['workerd', 'worker', 'browser'],
      mainFields: ['browser', 'module', 'main'],
      external: ['cloudflare:*'],
      // Fixed paths let a package that reads them get past them to its real failure.
      define: {
        'process.env.NODE_ENV': '"production"',
        __dirname: '"/bundle"',
        __filename: '"/bundle/index.js"',
        'import.meta.url': '"file:///bundle/index.mjs"',
      },
      plugins: [nodeBuiltins],
      outfile: path.join(directory, 'bundle.mjs'),
      absWorkingDir: directory,
      logLevel: 'silent',
    });
    return undefined;
  } catch (error) {
    const message = error.errors?.map(item => item.text).join('; ') ?? String(error);
    return { ok: false, name: 'BundleError', message, stack: [] };
  }
}
