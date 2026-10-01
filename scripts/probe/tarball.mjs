import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function get(url, type) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`);
  }
  return type === 'json' ? response.json() : response;
}

/**
 * Files of the newest release of an npm package, read from its published tarball, with the
 * version they came from. The registry is the source: a repository page may not match what ships.
 */
export async function readPackageFiles(name, files) {
  const latest = await get(`https://registry.npmjs.org/${name}/latest`, 'json');
  const directory = mkdtempSync(path.join(tmpdir(), 'edgefit-package-'));
  const tarball = path.join(directory, 'package.tgz');
  const response = await get(latest.dist.tarball, 'response');
  writeFileSync(tarball, Buffer.from(await response.arrayBuffer()));
  execFileSync('tar', ['xzf', tarball, '-C', directory, ...files.map(file => `package/${file}`)]);
  return {
    version: latest.version,
    texts: Object.fromEntries(
      files.map(file => [file, readFileSync(path.join(directory, 'package', file), 'utf8')]),
    ),
  };
}

/** One file of the newest release of an npm package. */
export async function readPackageFile(name, file) {
  const { version, texts } = await readPackageFiles(name, [file]);
  return { version, text: texts[file] };
}
