// The smallest valid WebAssembly module: the magic number and version 1.
const emptyModule = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);

/** Code that the docs of both platforms say may be disabled. */
export const dynamicChecks = {
  eval: () => globalThis.eval('1'),
  newFunction: () => new Function('return 1')(),
  wasmFromBytes: () => WebAssembly.compile(emptyModule),
};

const nodeModule = 'buffer';

/** Deno APIs that Netlify may block. Each runs with fixed arguments, never with user input. */
export const denoChecks = {
  // Computed as the probe computes its imports, so it fails when they fail.
  nodeImport: () => import(`node:${nodeModule}`),
  subprocess: () => new Deno.Command('true').output(),
  fileWrite: () => Deno.writeTextFile('/tmp/edgefit-witness.txt', 'edgefit'),
};

/** Runs each check, and records whether it ran and the error it gave if it did not. */
export async function runChecks(checks) {
  const results = {};
  for (const [name, check] of Object.entries(checks)) {
    try {
      await check();
      results[name] = { allowed: true };
    } catch (error) {
      results[name] = { allowed: false, error: `${error?.name}: ${error?.message}` };
    }
  }
  return results;
}
