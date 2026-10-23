import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const kill = 'process.kill(process.pid)';
const noSignals = ' [not workerd] [not netlify] [not vercel-edge]';
const guarded = [`api node:process.kill${noSignals}`];
const plain = ['api node:process.kill'];

/** The use of `process.kill` in a snippet, with the runtime checks that it sits behind. */
const killOf = (source: string): string[] =>
  usagesOf(source).filter(usage => usage.includes('process.kill'));

describe('the handler of a signal', () => {
  it('guards the code in a handler that is a function written in the call', () => {
    const source = `process.on('SIGTERM', () => {\n  ${kill};\n});`;
    expect(killOf(source)).toEqual(guarded);
    expect(usagesOf(source)).toContain('api node:process.on');
    expect(killOf(`process.once('SIGINT', async function () {\n  ${kill};\n});`)).toEqual(guarded);
  });

  it('guards a local function that only the handler reads', () => {
    expect(
      killOf(`function stop() {\n  ${kill};\n}\nprocess.addListener('SIGHUP', stop);`),
    ).toEqual(guarded);
    expect(killOf(`const stop = () => ${kill};\nprocess.on('SIGUSR2', stop);`)).toEqual(guarded);
  });

  it('reads the removal of a handler as a read that does not run it', () => {
    const source = `const stop = () => ${kill};\nprocess.on('SIGTERM', stop);\nprocess.removeListener('SIGTERM', stop);\nprocess.off('exit', stop);`;
    expect(killOf(source)).toEqual(guarded);
  });

  it('reads a handler through parentheses and a type cast', () => {
    expect(killOf(`process.on('SIGTERM', ((() => ${kill})));`)).toEqual(guarded);
    expect(killOf(`process.on('SIGTERM', (() => ${kill}) as () => void);`)).toEqual(guarded);
  });

  it('follows process when a file imports it', () => {
    const source = `import process from 'node:process';\nprocess.on('SIGHUP', () => ${kill});`;
    expect(killOf(source)).toEqual(guarded);
  });

  it('adds the guards to the checks that the handler already sits behind', () => {
    const source = `if (typeof Deno === 'undefined') {\n  process.on('SIGTERM', () => ${kill});\n}`;
    expect(killOf(source)).toEqual([`api node:process.kill [not deno]${noSignals}`]);
  });
});

describe('an optional call of process.on', () => {
  it('keeps the check of the call, and does not guard the handler', () => {
    expect(usagesOf(`process.on?.('SIGTERM', () => ${kill});`)).toEqual([
      'api node:process.on [guarded]',
      'api node:process.kill',
      'api node:process.pid',
    ]);
  });
});

describe('a function that is not only a signal handler', () => {
  it.each([
    ['is also called', `function stop() {\n  ${kill};\n}\nprocess.on('SIGTERM', stop);\nstop();`],
    [
      'is passed to other code',
      `const stop = () => ${kill};\nprocess.on('SIGTERM', stop);\nsetTimeout(stop, 1);`,
    ],
    [
      'is also the handler of another event',
      `const stop = () => ${kill};\nprocess.on('SIGTERM', stop);\nprocess.on('exit', stop);`,
    ],
    ['is exported', `export function stop() {\n  ${kill};\n}\nprocess.on('SIGTERM', stop);`],
  ])('keeps the findings when the function %s', (_name, source) => {
    expect(killOf(source)).toEqual(plain);
  });
});

describe('a call that does not set a signal handler', () => {
  it.each([
    ['for an event that is not a signal', `process.on('exit', () => ${kill});`],
    [
      'with an event that is not a string',
      `for (const signal of ['SIGTERM']) {\n  process.on(signal, () => ${kill});\n}`,
    ],
    ['on an object that is not process', `emitter.on('SIGTERM', () => ${kill});`],
    [
      'on a module that is not process',
      `import fs from 'node:fs';\nfs.on('SIGTERM', () => ${kill});`,
    ],
    ['with a call as the handler', `process.on('SIGTERM', make(${kill}));`],
    ['in an optional call', `process.on?.('SIGTERM', () => ${kill});`],
    ['with a spread as the handler', `process.on('SIGTERM', ...[() => ${kill}]);`],
    ['with no handler', `process.on('SIGTERM');\n${kill};`],
    ['with a choice as the handler', `process.on('SIGTERM', cond ? () => ${kill} : null);`],
  ])('keeps the findings %s', (_name, source) => {
    expect(killOf(source)).toEqual(plain);
  });
});
