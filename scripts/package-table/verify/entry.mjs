// The entry that runs inside a runtime: it imports the package, then runs the reach script when
// there is one, and gives one JSON object, `{ load, reach }`.

/** Starts the line of output that holds the result, so output of the package is skipped. */
export const marker = 'EDGEFIT_VERIFY ';

const steps = (specifier, reach) => `
const describe = (error, depth = 0) => ({
  ok: false,
  name: error?.name,
  code: error?.code,
  message: String(error?.message ?? error),
  stack: String(error?.stack ?? '').split('\\n').slice(0, 8),
  ...(error?.cause === undefined || depth >= 7 ? {} : { cause: describe(error.cause, depth + 1) }),
});

async function load() {
  try {
    await import(${JSON.stringify(specifier)});
    return { ok: true };
  } catch (error) {
    return describe(error);
  }
}

async function reach() {
  ${
    reach
      ? `try {
    const { run } = await import('./reach.mjs');
    await run();
    return { ok: true };
  } catch (error) {
    return describe(error);
  }`
      : 'return undefined;'
  }
}

async function finish(loaded) {
  const reached = loaded.ok ? await reach() : undefined;
  return reached === undefined ? { load: loaded } : { load: loaded, reach: reached };
}
`;

const hosts = {
  // The package loads at the top level, while the Worker starts, as in a real Worker: workerd
  // allows eval and new Function only then (io/worker.c++:2245, the allow_eval_during_startup
  // flag). The reach runs in fetch, at request time, as a real call of an export does.
  worker: () => `
const loaded = await load();

export default {
  async fetch() {
    return Response.json(await finish(loaded));
  },
};
`,
  // Bun and Deno print the result, then exit, so a handle that the package leaves open does not
  // hold them.
  script: () => `
console.log(${JSON.stringify(marker)} + JSON.stringify(await finish(await load())));
if (globalThis.Deno === undefined) process.exit(0);
else Deno.exit(0);
`,
};

/** The source of the entry. `host` is `worker` for workerd and `script` for Bun and Deno. */
export function entrySource({ specifier, reach, host }) {
  return `${steps(specifier, reach)}${hosts[host]()}`;
}

/** The result in the output of a `script` entry, or `undefined` when there is none. */
export function resultOf(stdout) {
  const line = stdout.split('\n').findLast(item => item.startsWith(marker));
  return line === undefined ? undefined : JSON.parse(line.slice(marker.length));
}
