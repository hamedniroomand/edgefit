/**
 * One targeted check per curated `mocked` entry. Each reports `implemented` when the API now does
 * its job, `noop` while it still does nothing, and `inconclusive` when it throws. `load` imports
 * a `node:` module by name, so a test can substitute a fake.
 */
const tick = () => new Promise(resolve => setTimeout(resolve));

function inTimer(read) {
  return new Promise(resolve => setTimeout(() => resolve(read())));
}

const verdict = works => (works ? 'implemented' : 'noop');

async function inspectorUrl(inspector) {
  inspector.open(0, '127.0.0.1');
  try {
    return verdict(typeof inspector.url() === 'string');
  } finally {
    inspector.close();
  }
}

const hooksSource = `export async function resolve(specifier, context, next) {
  if (specifier === 'probe:edgefit') {
    return { url: 'data:text/javascript,export default 1', shortCircuit: true };
  }
  return next(specifier, context);
}`;

export const mockedChecks = {
  async 'async_hooks.createHook'(load) {
    const { createHook } = await load('async_hooks');
    let called = false;
    const hook = createHook({
      init() {
        called = true;
      },
    }).enable();
    await tick();
    hook.disable();
    return verdict(called);
  },
  async 'async_hooks.executionAsyncId'(load) {
    const hooks = await load('async_hooks');
    return verdict((await inTimer(() => hooks.executionAsyncId())) !== 0);
  },
  async 'async_hooks.triggerAsyncId'(load) {
    const hooks = await load('async_hooks');
    return verdict((await inTimer(() => inTimer(() => hooks.triggerAsyncId()))) !== 0);
  },
  async 'async_hooks.executionAsyncResource'(load) {
    const hooks = await load('async_hooks');
    return verdict((await inTimer(() => hooks.executionAsyncResource())) !== process.stdin);
  },
  'inspector.url': async load => inspectorUrl(await load('inspector')),
  'inspector/promises.url': async load => inspectorUrl(await load('inspector/promises')),
  async 'module.register'(load) {
    const { register } = await load('module');
    register(`data:text/javascript,${encodeURIComponent(hooksSource)}`);
    try {
      // Built at runtime so a bundler or test runner does not rewrite the import.
      await new Function('specifier', 'return import(specifier)')('probe:edgefit');
      return 'implemented';
    } catch {
      return 'noop';
    }
  },
  async 'module.syncBuiltinESMExports'(load) {
    const { createRequire, syncBuiltinESMExports } = await load('module');
    const commonJs = createRequire(import.meta.url)('node:fs');
    const original = commonJs.readFileSync;
    const marker = () => {};
    commonJs.readFileSync = marker;
    try {
      syncBuiltinESMExports();
      return verdict((await import('node:fs')).readFileSync === marker);
    } finally {
      commonJs.readFileSync = original;
      syncBuiltinESMExports();
    }
  },
  async 'process.getActiveResourcesInfo'(load) {
    const process = await load('process');
    const timer = setTimeout(() => {}, 1000);
    try {
      return verdict(process.getActiveResourcesInfo().length > 0);
    } finally {
      clearTimeout(timer);
    }
  },
  async 'process._getActiveHandles'(load) {
    const [process, net] = await Promise.all([load('process'), load('net')]);
    const server = net.createServer().listen(0, '127.0.0.1');
    try {
      await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
      });
      return verdict(process._getActiveHandles().length > 0);
    } finally {
      server.close();
    }
  },
  async 'process._getActiveRequests'(load) {
    const [process, fs] = await Promise.all([load('process'), load('fs')]);
    const pending = new Promise(resolve => fs.stat('.', resolve));
    const active = process._getActiveRequests().length;
    await pending;
    return verdict(active > 0);
  },
  async 'process.setSourceMapsEnabled'(load) {
    const process = await load('process');
    process.setSourceMapsEnabled(false);
    try {
      return verdict(process.sourceMapsEnabled === false);
    } finally {
      process.setSourceMapsEnabled(true);
    }
  },
  async 'v8.setFlagsFromString'(load) {
    const [v8, vm] = await Promise.all([load('v8'), load('vm')]);
    v8.setFlagsFromString('--expose-gc');
    try {
      return verdict(typeof vm.runInNewContext('gc') === 'function');
    } catch {
      return 'noop';
    }
  },
};

export const loadNodeModule = async name => {
  const namespace = await import(/* @vite-ignore */ `node:${name}`);
  return namespace.default ?? namespace;
};

/** Runs the checks for the given APIs; a check that throws is `inconclusive`. */
export async function runMockedChecks(apis, load = loadNodeModule) {
  const outcomes = {};
  for (const api of apis) {
    try {
      outcomes[api] = await mockedChecks[api](load);
    } catch {
      outcomes[api] = 'inconclusive';
    }
  }
  return outcomes;
}
