// Reads and validates table/packages.json. Shared by the runner, the merge step and CI.
import { readFileSync } from 'node:fs';

const namePattern = /^(?:@[a-z0-9~][a-z0-9._~-]*\/)?[a-z0-9~][a-z0-9._~-]*$/u;

export function readList(
  file = process.env.PACKAGE_LIST ?? new URL('../../table/packages.json', import.meta.url),
) {
  const { packages } = JSON.parse(readFileSync(file, 'utf8'));
  const seen = new Set();
  const problems = [];
  for (const entry of packages) {
    if (typeof entry.name !== 'string' || !namePattern.test(entry.name)) {
      problems.push(`not a package name: ${JSON.stringify(entry.name)}`);
    } else if (seen.has(entry.name)) {
      problems.push(`listed twice: ${entry.name}`);
    }
    if (entry.main !== undefined && !/^\.\/\S+$/u.test(entry.main)) {
      problems.push(`main is not a subpath of ${entry.name}: ${JSON.stringify(entry.main)}`);
    }
    seen.add(entry.name);
  }
  if (problems.length > 0) {
    throw new Error(`table/packages.json: ${problems.join('; ')}`);
  }
  return packages;
}

/** `@scope/name` becomes `scope__name`, as the badge file names do. */
export function fileNameOf(name) {
  return name.replace(/^@/u, '').replace('/', '__');
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  console.log(`${readList().length} packages`);
}
