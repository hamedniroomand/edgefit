import { probeApis } from '../probe.mjs';
import { runChecks } from './checks.mjs';

/** The names on the global object and its prototypes, where some runtimes keep the Web APIs. */
function globalNames() {
  const names = new Set();
  for (
    let owner = globalThis;
    owner && owner !== Object.prototype;
    owner = Object.getPrototypeOf(owner)
  ) {
    for (const name of Object.getOwnPropertyNames(owner)) {
      // Each prototype has `constructor`, which is not a global that code reads.
      if (name !== 'constructor') {
        names.add(name);
      }
    }
  }
  return [...names].sort();
}

/** What a deployed witness reports about the runtime it runs in. */
export async function observe({ entry, spec, checks, load }) {
  return {
    entry,
    specHash: spec.hash,
    deno: globalThis.Deno?.version?.deno ?? null,
    names: globalNames(),
    outcomes: await probeApis(spec.apis, load),
    checks: await runChecks(checks),
  };
}

// A cached answer would hide a runtime change from the weekly read.
export const respond = async options =>
  Response.json(await observe(options), { headers: { 'cache-control': 'no-store' } });
