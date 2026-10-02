import { createHash } from 'node:crypto';

import { buildSpec } from '../apis.mjs';
import { readData } from '../data.mjs';

/**
 * The same lookups as the `deno (netlify-min)` probe, so the answer compares with the data the same
 * way and can later become the netlify-edge override layer.
 */
const netlifyApis = () => buildSpec('deno', { presence: true }).apis.map(({ api }) => api);

/** Every global name the vercel-edge allowlist keeps. */
export function vercelGlobals(allowlist = readData('allowlists/vercel-edge.json')) {
  return [
    ...allowlist.globals,
    ...allowlist.languageGlobals,
    ...allowlist.emulatorGlobals,
    ...allowlist.witnessGlobals,
    ...Object.keys(allowlist.globalMembers),
  ];
}

/** The members of the five modules Vercel allows, and of the globals the data lists members for. */
function vercelApis({ modules, globalMembers }) {
  return [
    ...Object.entries(modules).flatMap(([module, members]) => [
      module,
      ...members.map(member => `${module}.${member}`),
    ]),
    ...Object.entries(globalMembers).flatMap(([name, members]) =>
      members.map(member => `*globals*.${name}.${member}`),
    ),
  ];
}

const builders = { netlify: netlifyApis, vercel: vercelApis };

/**
 * Globals the data does not keep, which the Vercel middleware's own names showed in Witness run
 * 37075288327. The edge function hides its own names, so only `typeof` can show them there. A
 * candidate is a question for a review, not data.
 */
export const vercelCandidates = [
  'AsyncLocalStorage',
  'Float16Array',
  'DisposableStack',
  'AsyncDisposableStack',
  'SuppressedError',
];

/**
 * The globals a witness measures with `typeof`. On a Vercel edge route `globalThis` is a copy that
 * lacks most globals, but a bare name resolves through the real scope, as it does in user code.
 * `typeof undefined` says nothing.
 */
const globalsFor = {
  netlify: () => [],
  vercel: allowlist => [
    ...vercelGlobals(allowlist).filter(name => name !== 'undefined'),
    ...vercelCandidates,
  ],
};

/**
 * The lookups a witness makes, with a hash the witness returns, so a reader can see that the
 * deployed witness has the same list as the repository. A witness only looks APIs up and never
 * calls them, because the endpoint is public.
 */
export function witnessSpec(platform) {
  const allowlist = readData('allowlists/vercel-edge.json');
  const apis = [...new Set(builders[platform](allowlist))]
    .sort()
    .map(api => ({ api, lookup: true }));
  const globals = [...new Set(globalsFor[platform](allowlist))].sort();
  const hash = createHash('sha256')
    .update(JSON.stringify({ apis, globals }))
    .digest('hex')
    .slice(0, 16);
  return { hash, apis, globals };
}
