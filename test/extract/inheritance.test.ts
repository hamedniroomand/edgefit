import { describe, expect, it } from 'vite-plus/test';

import { extractUsages } from '@/extract/index.ts';
import { usagesOf } from '~/helpers.ts';

describe('extracting a Node.js parent class', () => {
  it('uses the class, and not the whole module, when a class extends it', () => {
    const source = "import { EventEmitter } from 'node:events';\nclass App extends EventEmitter {}";
    expect(usagesOf(source)).toEqual([
      'api node:events',
      'api node:events.EventEmitter',
      'dynamic node:events.EventEmitter',
    ]);
  });

  it('uses the class when util.inherits sets it as the parent', () => {
    const source =
      "import { inherits } from 'node:util';\nimport { EventEmitter } from 'node:events';\ninherits(Sub, EventEmitter);";
    expect(usagesOf(source)).toEqual([
      'api node:util',
      'api node:util.inherits',
      'api node:events',
      'api node:events.EventEmitter',
      'dynamic node:events.EventEmitter',
    ]);
  });

  it('visits a call with a missing parent argument as an ordinary call', () => {
    expect(usagesOf("import { inherits } from 'node:util';\ninherits(Sub);")).toEqual([
      'api node:util',
      'api node:util.inherits',
    ]);
  });

  it('visits a global parent class as an ordinary reference', () => {
    expect(usagesOf('class Failure extends Error {}', 'src/input.ts', new Set(['Error']))).toEqual([
      'api Error',
    ]);
  });
});

describe('extracting a CommonJS parent class', () => {
  it('follows a class that extends a required module', () => {
    const source = "const Emitter = require('events');\nclass Application extends Emitter {}";
    expect(usagesOf(source)).toEqual(['api node:events', 'api node:events', 'dynamic node:events']);
  });

  it('follows util.inherits read from a require call', () => {
    const source =
      "const inherits = require('util').inherits;\nconst EventEmitter = require('events');\ninherits(SonicBoom, EventEmitter);";
    expect(usagesOf(source)).toEqual([
      'api node:util.inherits',
      'api node:events',
      'api node:util.inherits',
      'api node:events',
      'dynamic node:events',
    ]);
  });

  it('follows util.inherits on a required util', () => {
    const source =
      "const util = require('util');\nconst EventEmitter = require('events');\nutil.inherits(A, EventEmitter);";
    expect(usagesOf(source)).toEqual([
      'api node:util',
      'api node:events',
      'api node:util.inherits',
      'api node:events',
      'dynamic node:events',
    ]);
  });

  it('follows util.inherits on a default import of util', () => {
    const source =
      "import util from 'util';\nimport EventEmitter from 'events';\nutil.inherits(A, EventEmitter);";
    expect(usagesOf(source)).toContain('dynamic node:events');
  });

  it('does not treat a nested inherits as util.inherits', () => {
    const source =
      "import util from 'util';\nimport { EventEmitter } from 'events';\nutil.x.inherits(A, EventEmitter);";
    const reasons = extractUsages('src/input.ts', source, {
      globals: new Set(),
      nodeEnv: 'production',
    })
      .filter(usage => usage.kind === 'dynamic')
      .map(usage => usage.reason);
    expect(reasons).toEqual(['passed on as a value, so its members may be used elsewhere']);
  });
});
