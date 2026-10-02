// The Netlify edge function. `build.mjs` stages it with the spec it was built with.
import { denoChecks, dynamicChecks } from './checks.mjs';
import { respond } from './handler.mjs';
import spec from './spec-data.mjs';

export default () =>
  respond({ entry: 'edge-function', spec, checks: { ...dynamicChecks, ...denoChecks } });
