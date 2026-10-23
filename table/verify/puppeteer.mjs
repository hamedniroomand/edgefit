// Reaches node:child_process.spawn: launch() starts the browser as a child process. The browser is
// a file that does nothing, so no browser download is needed. On workerd, spawn throws before the
// file starts. A runtime that has spawn starts the file, which exits at once, and launch fails
// because the browser did not start. The script ignores only the error that says the browser did
// not start, and rethrows every other error. The profile folder of the browser is inside the
// temporary folder, so the script removes it too.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import puppeteer from 'puppeteer';

export async function run() {
  const directory = mkdtempSync(path.join(tmpdir(), 'verify-'));
  try {
    const executablePath = path.join(directory, 'browser');
    writeFileSync(executablePath, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const userDataDir = path.join(directory, 'profile');
    const browser = await puppeteer.launch({ executablePath, userDataDir });
    await browser.close();
  } catch (error) {
    if (!String(error.message).startsWith('Failed to launch the browser process')) {
      throw error;
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
