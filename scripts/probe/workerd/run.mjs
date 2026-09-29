// `node workerd/run.mjs spec.json results.json`: runs the probe in the installed `workerd` package.
import { spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { workerdSettings } from '../data.mjs';

const [specFile, resultsFile] = process.argv.slice(2);
const parent = path.join(import.meta.dirname, '..');
const directory = mkdtempSync(path.join(tmpdir(), 'edgefit-workerd-'));
const port = 8787;
const { compatibilityDate, compatibilityFlags } = workerdSettings();

const modules = [
  ['worker.mjs', path.join(import.meta.dirname, 'worker.mjs')],
  ['probe.mjs', path.join(parent, 'probe.mjs')],
  ['classify.mjs', path.join(parent, 'classify.mjs')],
];
for (const [name, source] of modules) {
  copyFileSync(source, path.join(directory, name));
}
copyFileSync(specFile, path.join(directory, 'spec.json'));
writeFileSync(
  path.join(directory, 'config.capnp'),
  `using Workerd = import "/workerd/workerd.capnp";
const config :Workerd.Config = (
  services = [(name = "main", worker = .worker)],
  sockets = [(name = "http", address = "127.0.0.1:${port}", http = (), service = "main")],
);
const worker :Workerd.Worker = (
  modules = [
${modules.map(([name]) => `    (name = "${name}", esModule = embed "${name}"),`).join('\n')}
    (name = "spec.json", json = embed "spec.json"),
  ],
  compatibilityDate = "${compatibilityDate}",
  compatibilityFlags = ${JSON.stringify(compatibilityFlags)},
);
`,
);

const binary = createRequire(path.join(process.cwd(), 'noop.js')).resolve('workerd/bin/workerd');
const server = spawn(binary, ['serve', path.join(directory, 'config.capnp')], { stdio: 'inherit' });
try {
  let response;
  for (let attempt = 0; !response && attempt < 50; attempt++) {
    response = await fetch(`http://127.0.0.1:${port}`).catch(() => undefined);
    if (!response) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  const results = await response.json();
  const { version } = createRequire(path.join(process.cwd(), 'noop.js'))('workerd/package.json');
  writeFileSync(resultsFile, JSON.stringify({ ...results, version }));
} finally {
  server.kill();
}
