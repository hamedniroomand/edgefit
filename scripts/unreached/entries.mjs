// The checks of one entry of data/unreached.json or data/stored-modules.json against a release.

export { inRange } from '../../src/data/version-range.ts';

/**
 * Whether the file uses the API as the code writes it. A member of a Node.js module may be read
 * as `module.member`, or imported by its name: `import { spawn } from 'node:child_process'` and
 * `const { spawn } = require('child_process')`. A report shows a computed read or call as
 * `globalThis[<expression>]` or `require(<expression>)`. The check looks for the text before
 * `<expression>`.
 */
export function uses(text, api) {
  // The file must hold the text before `<expression>` as the report shows it. The match ignores
  // letter case, so `createRequire(` counts for `require(<expression>)`.
  const computed = /^(?<start>.+[[(])<expression>[\])]$/u.exec(api)?.groups?.start;
  if (computed !== undefined) {
    return text.toLowerCase().includes(computed.toLowerCase());
  }
  const name = api.replace(/^node:/u, '');
  if (!api.startsWith('node:')) {
    return text.includes(name);
  }
  const [module, ...path] = name.split('.');
  const named =
    [`node:${module}`, `'${module}'`, `"${module}"`].some(item => text.includes(item)) &&
    text.includes(path.at(-1) ?? '');
  return text.includes(name) || named;
}

/** The members of a stored-modules entry that the text of its file does not hold. */
export function missingMembers(text, entry) {
  return entry.members.filter(member => !text.includes(member));
}

/** The names of an entry that its file no longer holds, with the reason to report for each. */
export function problemsOf(text, entry) {
  const apis = entry.apis ?? [];
  return [
    ...apis.filter(api => !uses(text, api)).map(api => `no longer uses ${api}.`),
    ...(entry.members === undefined
      ? []
      : missingMembers(text, entry).map(member => `no longer holds the member ${member}.`)),
  ];
}
