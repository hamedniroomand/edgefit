// `node apis-cli.mjs <runtime> [--discover] [--mocked]` prints the probe spec as JSON.
import { buildSpec } from './apis.mjs';

const [runtime, ...flags] = process.argv.slice(2);
console.log(
  JSON.stringify(
    buildSpec(runtime, {
      discover: flags.includes('--discover'),
      mocked: flags.includes('--mocked'),
    }),
  ),
);
