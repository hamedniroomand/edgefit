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

const userAgentDeno = () => /\bDeno\/(\S+)/u.exec(globalThis.navigator?.userAgent ?? '')?.[1];

/** Netlify hides `Deno.version.deno`, so the other places a runtime reports its version are kept. */
const runtimeEvidence = () => ({
  denoVersion: globalThis.Deno?.version ?? null,
  denoBuild: globalThis.Deno?.build ?? null,
  userAgent: globalThis.navigator?.userAgent ?? null,
  processVersion: globalThis.process?.version ?? null,
  processVersions: globalThis.process?.versions ?? null,
});

/** What a deployed witness reports about the runtime it runs in. */
export async function observe({ entry, spec, checks, load }) {
  return {
    entry,
    specHash: spec.hash,
    // An empty string is a hidden version, not a version.
    deno:
      globalThis.Deno?.version?.deno ||
      globalThis.process?.versions?.deno ||
      userAgentDeno() ||
      null,
    runtime: runtimeEvidence(),
    names: globalNames(),
    outcomes: await probeApis(spec.apis, load),
    checks: await runChecks(checks),
  };
}

// A cached answer would hide a runtime change from the weekly read.
export const respond = async options =>
  Response.json(await observe(options), { headers: { 'cache-control': 'no-store' } });
