// `node vercel/emulator-run.mjs results.json` from a directory with @edge-runtime/vm installed.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const installed = createRequire(path.join(process.cwd(), 'noop.js'));
const { EdgeVM } = installed('@edge-runtime/vm');
const { version } = installed('@edge-runtime/vm/package.json');
const vm = new EdgeVM();

const throws = code => {
  try {
    vm.evaluate(code);
    return false;
  } catch {
    return true;
  }
};

writeFileSync(
  process.argv[2],
  JSON.stringify({
    version,
    names: vm.evaluate('Object.getOwnPropertyNames(globalThis)'),
    evalThrows: throws('eval("1")'),
    functionThrows: throws('new Function("return 1")()'),
  }),
);
