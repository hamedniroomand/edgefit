import fs from 'node:fs';

// Small helpers that only hold a check.
const isDeno = () => typeof Deno !== 'undefined';

function isBun() {
  return Boolean(process.versions.bun);
}

const isWorkers = navigator.userAgent === 'Cloudflare-Workers';

export default {
  fetch(request) {
    // Each branch runs on one runtime. Only the last one runs on Workers.
    if (typeof Deno !== 'undefined') {
      fs.watch('deno');
    } else if (process.versions?.bun) {
      fs.watch('bun');
    } else {
      fs.watchFile('workers');
    }

    // The same checks through helpers.
    if (isDeno() || isBun()) {
      // Either runtime may be the one, so this is not known to skip Workers.
      fs.unwatchFile('deno or bun');
    }
    if (isDeno()) {
      fs.unwatchFile('deno');
    }
    if (isWorkers) {
      fs.watchFile('workers only');
    }

    // A try block stops the error of an API Workers lack.
    try {
      new FileReader().readAsText(request.body);
    } catch {
      // Not a runtime with FileReader.
    }
    // It does not stop what exists and throws, so this is still reported.
    try {
      fs.watch(request.url);
    } catch {}
    // Nor a catch that throws again.
    try {
      new FileReader().readAsText(request.body);
    } catch (error) {
      throw new Error('no FileReader', { cause: error });
    }
    return new Response('ok');
  },
};
