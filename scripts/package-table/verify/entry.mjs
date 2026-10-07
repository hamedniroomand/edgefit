// The entry that runs inside a runtime: it imports the package, then runs the reach script when
// there is one, and gives one JSON object, `{ load, reach }`.

/** Starts the line of output that holds the result, so output of the package is skipped. */
export const marker = 'EDGEFIT_VERIFY ';

const verifyFunction = (specifier, reach) => `
const describe = (error, depth = 0) => ({
  ok: false,
  name: error?.name,
  code: error?.code,
  message: String(error?.message ?? error),
  stack: String(error?.stack ?? '').split('\\n').slice(0, 8),
  ...(error?.cause === undefined || depth >= 7 ? {} : { cause: describe(error.cause, depth + 1) }),
});

async function verify() {
  try {
    await import(${JSON.stringify(specifier)});
  } catch (error) {
    return { load: describe(error) };
  }
  ${
    reach
      ? `try {
    const { run } = await import('./reach.mjs');
    await run();
    return { load: { ok: true }, reach: { ok: true } };
  } catch (error) {
    return { load: { ok: true }, reach: describe(error) };
  }`
      : 'return { load: { ok: true } };'
  }
}
`;

const hosts = {
  // workerd serves the result to one request.
  worker: () => `
export default {
  async fetch() {
    return Response.json(await verify());
  },
};
`,
  // Bun and Deno print it, then exit, so a handle that the package leaves open does not hold them.
  script: () => `
console.log(${JSON.stringify(marker)} + JSON.stringify(await verify()));
if (globalThis.Deno === undefined) process.exit(0);
else Deno.exit(0);
`,
};

/** The source of the entry. `host` is `worker` for workerd and `script` for Bun and Deno. */
export function entrySource({ specifier, reach, host }) {
  return `${verifyFunction(specifier, reach)}${hosts[host]()}`;
}

/** The result in the output of a `script` entry, or `undefined` when there is none. */
export function resultOf(stdout) {
  const line = stdout.split('\n').findLast(item => item.startsWith(marker));
  return line === undefined ? undefined : JSON.parse(line.slice(marker.length));
}
