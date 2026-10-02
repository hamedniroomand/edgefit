// The smallest valid WebAssembly module: the magic number and version 1.
const emptyModule = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);

/** Code that the docs of both platforms say may be disabled. */
export const dynamicChecks = {
  eval: () => globalThis.eval('1'),
  newFunction: () => new Function('return 1')(),
  wasmFromBytes: () => WebAssembly.compile(emptyModule),
  wasmInstantiateFromBytes: () => WebAssembly.instantiate(emptyModule),
};

/** Vercel's middleware has a `require` global. A call with a fixed name shows whether it works. */
export const vercelChecks = {
  requireBuffer: () => typeof globalThis.require('buffer'),
};

const permission = name => () => Deno.permissions.querySync({ name }).state;

const nodeModule = 'buffer';

/** Deno APIs that Netlify may block. Each runs with fixed arguments, never with user input. */
export const denoChecks = {
  // Computed as the probe computes its imports, so it fails when they fail.
  nodeImport: () => import(`node:${nodeModule}`),
  runPermission: permission('run'),
  writePermission: permission('write'),
  envPermission: permission('env'),
  // A separate check, so an `execPath` that throws does not read as a blocked subprocess.
  execPath: () => Deno.execPath(),
  // An absolute path, because Netlify sets no PATH to search.
  subprocess: () => new Deno.Command(Deno.execPath(), { args: ['--version'] }).output(),
  fileWrite: () => Deno.writeTextFile('/tmp/edgefit-witness.txt', 'edgefit'),
};

/**
 * Runs each check, and records whether it ran, the text it returned, and the error it gave if it
 * did not.
 */
export async function runChecks(checks) {
  const results = {};
  for (const [name, check] of Object.entries(checks)) {
    try {
      const value = await check();
      results[name] = typeof value === 'string' ? { allowed: true, value } : { allowed: true };
    } catch (error) {
      results[name] = { allowed: false, error: `${error?.name}: ${error?.message}` };
    }
  }
  return results;
}
