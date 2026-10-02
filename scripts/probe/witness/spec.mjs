import { createHash } from 'node:crypto';

import { buildSpec } from '../apis.mjs';
import { readData } from '../data.mjs';

/**
 * The same lookups as the `deno (netlify-min)` probe, so the answer compares with the data the same
 * way and can later become the netlify-edge override layer.
 */
const netlifyApis = () => buildSpec('deno', { presence: true }).apis.map(({ api }) => api);

/** The members of the five modules Vercel allows, and of the globals the data lists members for. */
function vercelApis() {
  const { modules, globalMembers } = readData('allowlists/vercel-edge.json');
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
 * The lookups a witness makes, with a hash the witness returns, so a reader can see that the
 * deployed witness has the same list as the repository. A witness only looks APIs up and never
 * calls them, because the endpoint is public.
 */
export function witnessSpec(platform) {
  const apis = [...new Set(builders[platform]())].sort().map(api => ({ api, lookup: true }));
  const hash = createHash('sha256').update(JSON.stringify(apis)).digest('hex').slice(0, 16);
  return { hash, apis };
}
