import { classifyThrown, isDenied } from './classify.mjs';

const SETTLE_MS = 100;

/** Resolves `*globals*.a.b` from the global object, as the data names global APIs. */
function lookupGlobal(path) {
  let owner;
  let member = globalThis;
  for (const key of path) {
    owner = member;
    member = member?.[key];
  }
  if (member === undefined || path.length === 0) {
    throw new TypeError(`*globals*.${path.join('.')} is undefined`);
  }
  return { owner, member };
}

const loadNodeModule = name => import(/* @vite-ignore */ `node:${name}`);

/**
 * Resolves the module namespace, then each path segment, returning the member and its owner.
 * The data records a module's named exports and its `default` separately, so an `exact` lookup
 * does not fall back to `default` for a name the namespace lacks.
 */
async function lookup(api, { exact, load }) {
  const [module, ...path] = api.split('.');
  if (module === '*globals*') {
    return lookupGlobal(path);
  }
  const namespace = await load(module);
  if (namespace === undefined) {
    throw new TypeError(`${module} is not a module`);
  }
  if (path.length === 0) {
    return { owner: namespace, member: namespace };
  }
  let owner = namespace;
  let member = exact ? namespace[path[0]] : (namespace[path[0]] ?? namespace.default?.[path[0]]);
  for (const key of path.slice(1)) {
    owner = member;
    member = member[key];
  }
  if (member === undefined) {
    throw new TypeError(`${api} is undefined`);
  }
  return { owner, member };
}

/** Waits for a returned promise so a rejection is classified, without hanging on one that never settles. */
async function settle(value) {
  if (typeof value?.then !== 'function') {
    return;
  }
  let timer;
  await Promise.race([
    value,
    new Promise(resolve => {
      timer = setTimeout(resolve, SETTLE_MS);
    }),
  ]).finally(() => clearTimeout(timer));
}

function isClass(member, kind) {
  return kind === 'class' || /^class\b/u.test(Function.prototype.toString.call(member));
}

export async function probeApi({ api, kind, lookup: lookupOnly = false }, load = loadNodeModule) {
  let found;
  try {
    found = await lookup(api, { exact: lookupOnly, load });
  } catch {
    return 'missing';
  }
  if (lookupOnly) {
    return 'present';
  }
  const { owner, member } = found;
  if (typeof member !== 'function' || isDenied(api)) {
    return 'inconclusive';
  }
  try {
    await settle(isClass(member, kind) ? new member() : Reflect.apply(member, owner, []));
  } catch (error) {
    return classifyThrown(error);
  }
  return 'inconclusive';
}

/**
 * Probes each API in turn, since a call may change state the next one reads. With `PROBE_TRACE`
 * set, each name is logged first, so the last line shows which call a hung probe was in. `load`
 * imports a `node:` module by name, for a bundler that cannot follow a computed import.
 */
export async function probeApis(apis, load = loadNodeModule) {
  const trace = Boolean(globalThis.process?.env?.PROBE_TRACE);
  const outcomes = {};
  for (const entry of apis) {
    if (trace) {
      console.error(`probe ${entry.api}${entry.lookup ? ' (lookup)' : ''}`);
    }
    outcomes[entry.api] = await probeApi(entry, load);
  }
  return outcomes;
}
