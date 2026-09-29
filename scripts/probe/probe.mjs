import { classifyThrown, isDenied } from './classify.mjs';

const SETTLE_MS = 100;

/** Resolves the module namespace, then each path segment, returning the member and its owner. */
async function lookup(api) {
  const [module, ...path] = api.split('.');
  const namespace = await import(/* @vite-ignore */ `node:${module}`);
  let owner = namespace;
  let member = namespace[path[0]] ?? namespace.default?.[path[0]];
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

export async function probeApi({ api, kind }) {
  let found;
  try {
    found = await lookup(api);
  } catch {
    return 'missing';
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

/** Probes each API in turn, since a call may change state the next one reads. */
export async function probeApis(apis) {
  const outcomes = {};
  for (const entry of apis) {
    outcomes[entry.api] = await probeApi(entry);
  }
  return outcomes;
}
