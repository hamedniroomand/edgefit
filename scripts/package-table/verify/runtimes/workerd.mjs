// Runs an entry in the installed workerd: bundles it, serves it with the pinned settings, and
// requests it once.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { workerdSettings } from '../../../probe/data.mjs';
import { bundle } from '../bundle.mjs';
import { timeoutMs } from './script.mjs';

const port = 8792;
// The workerd package of the job, installed at the pinned version like the Probe workflow does.
const installed = createRequire(path.join(process.env.WORKERD_DIR ?? process.cwd(), 'noop.js'));

export const host = 'worker';
export const version = () => installed('workerd/package.json').version;

function writeConfig(directory) {
  const { compatibilityDate, compatibilityFlags } = workerdSettings();
  writeFileSync(
    path.join(directory, 'config.capnp'),
    `using Workerd = import "/workerd/workerd.capnp";
const config :Workerd.Config = (
  services = [(name = "main", worker = .worker)],
  sockets = [(name = "http", address = "127.0.0.1:${port}", http = (), service = "main")],
);
const worker :Workerd.Worker = (
  modules = [(name = "bundle.mjs", esModule = embed "bundle.mjs")],
  compatibilityDate = "${compatibilityDate}",
  compatibilityFlags = ${JSON.stringify(compatibilityFlags)},
);
`,
  );
}

/** Requests the worker until it answers, or until the time is up. */
async function request(deadline) {
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop -- one try at a time while workerd starts
    const response = await fetch(`http://127.0.0.1:${port}`, {
      signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
    }).catch(() => undefined);
    if (response !== undefined) {
      return response.text();
    }
    // eslint-disable-next-line no-await-in-loop -- wait before the next try
    await new Promise(resolve => {
      setTimeout(resolve, 200);
    });
  }
  return undefined;
}

export async function run(directory) {
  const failed = await bundle(directory);
  if (failed !== undefined) {
    return { run: { load: failed } };
  }
  writeConfig(directory);
  const server = spawn(installed.resolve('workerd/bin/workerd'), ['serve', 'config.capnp'], {
    cwd: directory,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  server.stderr.on('data', chunk => {
    stderr += chunk;
  });
  try {
    const text = await request(Date.now() + timeoutMs);
    if (text === undefined) {
      return { failure: 'timeout' };
    }
    try {
      return { run: JSON.parse(text) };
    } catch {
      return { failure: `no result: ${text.slice(0, 200)} ${stderr.slice(-200)}` };
    }
  } finally {
    server.kill();
  }
}
