// The Vercel middleware and edge route share this. `build.mjs` stages it with its spec.
// Vercel's bundler accepts only static imports of the five modules it allows.
import * as assert from 'node:assert';
import * as async_hooks from 'node:async_hooks';
import * as buffer from 'node:buffer';
import * as events from 'node:events';
import * as util from 'node:util';

import { dynamicChecks, vercelChecks } from './checks.mjs';
import { respond } from './handler.mjs';
import spec from './spec-data.mjs';

const modules = { assert, async_hooks, buffer, events, util };

export const handle = entry =>
  respond({
    entry,
    spec,
    checks: { ...dynamicChecks, ...vercelChecks },
    load: name => modules[name],
  });
