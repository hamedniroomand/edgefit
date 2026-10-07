// The verify plan: which packages run on a runtime, how, and against which findings. Reads the
// reach scripts in table/verify/ and rejects a script that does not import an export that reaches
// a finding of its row.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { parseSync } from 'oxc-parser';

const importNames = { Default: () => 'default', NamespaceObject: () => '*', Name: name => name };

/** The static imports of a script, as `{ specifier, names }`. */
export function importsOf(source, file = 'script.mjs') {
  return parseSync(file, source).module.staticImports.map(item => ({
    specifier: item.moduleRequest.value,
    names: item.entries.map(entry => importNames[entry.importName.kind](entry.importName.name)),
  }));
}

/** The names that a script imports from the package `name` or from a subpath of it. */
export function namesFrom(imports, name) {
  return imports
    .filter(item => item.specifier === name || item.specifier.startsWith(`${name}/`))
    .flatMap(item => item.names);
}

/** The entry that decides the result of a package. */
const mainEntry = result =>
  result.entries.find(entry => entry.subpath === (result.main ?? '.')) ?? result.entries[0];

/**
 * The findings of a row on a target: the ones that every export reaches, and the ones under
 * exports, each with the names of the exports that reach it.
 */
export function rowFindings(result, target) {
  const cell = mainEntry(result)?.results[target];
  const byApi = new Map();
  for (const { name, findings } of cell?.exports ?? []) {
    for (const finding of findings) {
      const found = byApi.get(finding.api) ?? { ...finding, exports: [] };
      found.exports.push(name);
      byApi.set(finding.api, found);
    }
  }
  return [...(cell?.findings ?? []), ...byApi.values()];
}

/** Why a reach script cannot verify its row, or `undefined` when it can. */
export function scriptProblem(imports, name, findings) {
  const names = namesFrom(imports, name);
  if (names.length === 0) {
    return `imports nothing from ${name}`;
  }
  const errors = findings.filter(finding => finding.level === 'error');
  if (errors.some(finding => finding.exports === undefined)) {
    return undefined;
  }
  const reaching = new Set(errors.flatMap(finding => finding.exports));
  return names.some(item => reaching.has(item))
    ? undefined
    : `imports none of the exports that reach a finding: ${[...reaching].join(', ')}`;
}

/** The reach script of a package, when there is one. */
export function scriptOf(directory, file) {
  const script = path.join(directory, `${file}.mjs`);
  return existsSync(script) ? script : undefined;
}

/**
 * What to run for a package on a runtime: a load for a pass row, a reach for a fail row with a
 * script, and nothing for any other row.
 */
export function planOf(result, runtime, script) {
  const status = result.summary?.[runtime];
  if (result.error !== undefined || (status !== 'pass' && status !== 'fail')) {
    return undefined;
  }
  const findings = rowFindings(result, runtime);
  // A row that names its main subpath, such as `./app` for `firebase`, loads that subpath.
  const specifier =
    result.main === undefined ? result.package : `${result.package}${result.main.slice(1)}`;
  const plan = { package: result.package, specifier, resolved: result.resolved, status, findings };
  if (status === 'pass' || script === undefined) {
    return { ...plan, kind: 'load' };
  }
  const problem = scriptProblem(
    importsOf(readFileSync(script, 'utf8'), script),
    result.package,
    findings,
  );
  return problem === undefined
    ? { ...plan, kind: 'reach', script }
    : { ...plan, kind: 'load', problem };
}
