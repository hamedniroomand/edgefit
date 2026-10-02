// Usage: node scripts/unenv/generate.mjs <path to an unpacked unenv package>
// Writes data/unenv.json: the exports of each unenv Node polyfill that are constant values.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import tty from 'node:tty';
import { pathToFileURL } from 'node:url';

const packageDirectory = path.resolve(process.argv[2] ?? '');
const nodeDirectory = path.join(packageDirectory, 'dist', 'runtime', 'node');
const { version } = JSON.parse(readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'));

function moduleFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'internal' || entry.name.startsWith('_')) {
      return [];
    }
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? moduleFiles(file) : entry.name.endsWith('.mjs') ? [file] : [];
  });
}

// A function, class or instance can be a stub that no marker shows, so only data is recorded:
// primitives, and plain objects and arrays that hold no function at any depth.
function isConstant(value) {
  if (value === null || ['string', 'number', 'boolean', 'bigint'].includes(typeof value)) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isConstant);
  }
  const plain = typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
  // A getter can compute or throw, so it is not data.
  return (
    plain &&
    Object.values(Object.getOwnPropertyDescriptors(value)).every(
      descriptor => 'value' in descriptor && isConstant(descriptor.value),
    )
  );
}

// unenv's `process` opens real tty streams when it loads, which fails without a terminal.
tty.ReadStream = class {};
tty.WriteStream = class {};
syncBuiltinESMExports();

const modules = {};
for (const file of moduleFiles(nodeDirectory).sort()) {
  const name = path
    .relative(nodeDirectory, file)
    .replace(/\.mjs$/u, '')
    .split(path.sep)
    .join('/');
  const exports = await import(pathToFileURL(file).href);
  modules[name] = Object.keys(exports)
    .filter(key => key !== 'default' && isConstant(exports[key]))
    .sort();
}

const output = path.join(import.meta.dirname, '..', '..', 'data', 'unenv.json');
writeFileSync(output, `${JSON.stringify({ unenv: version, modules }, null, 2)}\n`);
