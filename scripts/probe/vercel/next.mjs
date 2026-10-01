/** Where Next.js's edge build lists the Node.js modules it keeps, and stubs out the rest. */
export const nextPluginFile = 'dist/build/webpack/plugins/middleware-plugin.js';

/** The names in `const SUPPORTED_NATIVE_MODULES = [ 'buffer', ... ]`, or `undefined` if it moved. */
export function parseSupportedModules(source) {
  const list = /SUPPORTED_NATIVE_MODULES\s*=\s*\[([^\]]*)\]/u.exec(source)?.[1];
  return list === undefined
    ? undefined
    : [...list.matchAll(/['"]([^'"]+)['"]/gu)].map(match => match[1]);
}

/**
 * Whether unsupported modules are replaced with a stand-in that throws when it is used, which is
 * why importing one is harmless and the vercel-edge target only reports uses.
 */
export const hasStandIn = source => source.includes('__import_unsupported');

/** Where Next.js's edge build and the data differ. `modules` are the keys of the allowlist. */
export function compareNext({ supported, standIn }, modules) {
  const sections = [];
  const lacking = supported.filter(name => !modules.includes(name)).sort();
  const extra = modules.filter(name => !supported.includes(name)).sort();
  if (lacking.length > 0) {
    sections.push({
      title: 'Next.js: modules its edge build keeps that the data does not',
      items: lacking,
    });
  }
  if (extra.length > 0) {
    sections.push({
      title: 'Next.js: modules in the data that its edge build no longer keeps',
      items: extra,
    });
  }
  if (!standIn) {
    sections.push({
      title:
        'Next.js no longer replaces unsupported Node.js modules with a stand-in (vercel-edge reports uses, not imports, because of it)',
      items: ['__import_unsupported'],
    });
  }
  return sections;
}

/** Next's edge sandbox, and @vercel/node's dev server: each lists which members of the five modules exist. */
export const nextSandboxFile = 'dist/server/web/sandbox/context.js';
export const vercelNodeFile = 'dist/dev-server.mjs';

/**
 * `NativeModuleMap`: the members each allowed module exposes, as `{ util: ['format', ...] }`.
 * Next writes `'node:util': (0, _pick.pick)(_nodeutil.default, [...])` and @vercel/node
 * `util: pick(UtilImplementation, [...])`. `undefined` when the map is not found.
 */
export function parseNativeModuleMap(source) {
  const pattern =
    /['"]?(?:node:)?([a-z_/]+)['"]?\s*:\s*(?:\(0,\s*_pick\.pick\)|pick)\(\s*[\w.$]+\s*,\s*\[([^\]]*)\]\s*\)/gu;
  const entries = [...source.matchAll(pattern)].map(match => [
    match[1],
    [...match[2].matchAll(/['"]([^'"]+)['"]/gu)].map(member => member[1]),
  ]);
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

const sorted = names => [...names].sort();

/**
 * Where a source's member lists and the data differ. `modules` is the allowlist: a module maps to
 * its members, or to `true`, which allows all of them and so can never match a list.
 */
export function compareMembers(label, observed, modules) {
  const sections = [];
  for (const [module, members] of Object.entries(observed)) {
    const data = modules[module];
    if (data === undefined) {
      continue;
    }
    if (!Array.isArray(data)) {
      sections.push({
        title: `${label}: ${module} exposes only some members, but the data allows all of them`,
        items: sorted(members),
      });
      continue;
    }
    const lacking = members.filter(name => !data.includes(name));
    const extra = data.filter(name => !members.includes(name));
    if (lacking.length > 0) {
      sections.push({
        title: `${label}: members of ${module} it exposes that the data lacks`,
        items: sorted(lacking),
      });
    }
    if (extra.length > 0) {
      sections.push({
        title: `${label}: members of ${module} in the data that it does not expose`,
        items: sorted(extra),
      });
    }
  }
  return sections;
}

/** The two sources describe the same runtime, so they are expected to agree with each other. */
export function compareSources(first, second) {
  const differing = Object.keys(first).filter(
    module =>
      JSON.stringify(sorted(first[module] ?? [])) !== JSON.stringify(sorted(second[module] ?? [])),
  );
  return differing.length === 0
    ? []
    : [
        {
          title: 'Next.js and @vercel/node list different members (one of them changed)',
          items: differing,
        },
      ];
}
