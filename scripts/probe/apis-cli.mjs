// `node apis-cli.mjs <runtime> [--discover] [--mocked] [--drift]` prints the probe spec as JSON.
import { buildSpec } from './apis.mjs';

const [runtime, ...flags] = process.argv.slice(2);
console.log(
  JSON.stringify(
    buildSpec(runtime, {
      discover: flags.includes('--discover'),
      mocked: flags.includes('--mocked'),
      drift: flags.includes('--drift'),
    }),
  ),
);
