// The checks of one entry of data/unreached.json or data/stored-modules.json against a release.

function compare(left, right) {
  const [a, b] = [left, right].map(version => version.split('.').map(Number));
  return a.reduce((order, part, index) => order || part - (b[index] ?? 0), 0);
}

/** Whether the release is in the range. A range without `max` has no upper end. */
export const inRange = (version, { min, max }) =>
  compare(version, min) >= 0 && (max === undefined || compare(version, max) <= 0);

/**
 * Whether the file uses the API as the code writes it. A member of a Node.js module may be read
 * as `module.member`, or imported by its name: `import { spawn } from 'node:child_process'` and
 * `const { spawn } = require('child_process')`.
 */
export function uses(text, api) {
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
