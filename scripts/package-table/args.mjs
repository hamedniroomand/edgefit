// Usage: node args.mjs <name>
// Prints the arguments of `edgefit package` for a row of the table, one for each line. The runner
// of the table and the Package list job both run a row with them.
import { readList } from './list.mjs';

/**
 * The arguments of `edgefit package` for a row: its result as JSON, the subpaths that it skips and
 * its main subpath.
 * @param {{ name: string, skip?: readonly string[], main?: string }} entry
 * @returns {string[]}
 */
export function packageArgs(entry) {
  return [
    'package',
    entry.name,
    '--format',
    'json',
    ...(entry.skip ?? []).flatMap(subpath => ['--skip', subpath]),
    ...(entry.main === undefined ? [] : ['--main', entry.main]),
  ];
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [name] = process.argv.slice(2);
  const entry = readList().find(row => row.name === name);
  if (entry === undefined) {
    console.error(`${name} is not a row of table/packages.json`);
    process.exitCode = 2;
  } else {
    console.log(packageArgs(entry).join('\n'));
  }
}
