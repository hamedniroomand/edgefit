import { describe, expect, it } from 'vite-plus/test';

import { usagesOf as usagesWith } from '~/helpers.ts';

const globals = new Set(['globalThis']);
const usagesOf = (source: string): string[] => usagesWith(source, 'src/input.ts', globals);

const read = 'dynamic globalThis[<expression>]';
const everywhere = ' [not workerd] [not bun] [not deno] [not netlify] [not vercel-edge]';
const guarded = [`${read}${everywhere}`];
const hostCode = [read];

describe('a function that is sent to a browser page', () => {
  it('guards the code of the function on every runtime', () => {
    expect(usagesOf('page.evaluate(name => globalThis[name].args, key);')).toEqual(guarded);
  });

  it('still reports the same read in code of the caller', () => {
    expect(usagesOf('export const get = name => globalThis[name].args;')).toEqual(hostCode);
  });

  it.each(['evaluate', 'evaluateHandle', 'evaluateOnNewDocument'])('reads a call of %s', method => {
    expect(usagesOf(`page.${method}(name => globalThis[name].args, key);`)).toEqual(guarded);
  });

  it.each([
    ['a member of this', 'this.#page.evaluate(name => globalThis[name].args, key);'],
    ['an optional chain', 'page?.evaluate(name => globalThis[name].args, key);'],
    ['a name in brackets', "page['evaluate'](name => globalThis[name].args, key);"],
    ['an await', 'await page.evaluate(name => globalThis[name].args, key);'],
  ])('reads %s', (_name, call) => {
    expect(usagesOf(call)).toEqual(guarded);
  });

  it.each([
    ['an async arrow', 'page.evaluate(async name => globalThis[name].args);'],
    ['an arrow with a block', 'page.evaluate(name => { return globalThis[name].args; });'],
    ['a function expression', 'page.evaluate(function (name) { return globalThis[name].args; });'],
    ['a nested function', 'page.evaluate(() => () => globalThis[name].args);'],
    ['a type assertion', 'page.evaluate((name => globalThis[name].args) as any);'],
    ['a satisfies clause', 'page.evaluate((name => globalThis[name].args) satisfies any);'],
    ['parentheses', 'page.evaluate((name => globalThis[name].args));'],
  ])('reads %s as the function', (_name, call) => {
    expect(usagesOf(call)).toEqual(guarded);
  });

  it('guards an API that the function uses', () => {
    expect(usagesOf("page.evaluate(() => require('node:dgram'));")).toContain(
      `api node:dgram${everywhere}`,
    );
  });

  it('reads the arguments after the function as code of the caller', () => {
    expect(usagesOf('page.evaluate(name => name, globalThis[key].args);')).toEqual(hostCode);
  });
});

describe('a call that does not send a function to a browser page', () => {
  it.each([
    ['a call with no method', 'evaluate(name => globalThis[name].args);'],
    ['another method', 'page.run(name => globalThis[name].args);'],
    ['an optional call', 'page.evaluate?.(name => globalThis[name].args);'],
    ['a function as the second argument', "page.evaluate('x', name => globalThis[name].args);"],
    ['a function inside a call', 'page.evaluate(wrap(name => globalThis[name].args));'],
    ['a spread', 'page.evaluate(...[name => globalThis[name].args]);'],
    ['a class expression', 'page.evaluate(class { static { globalThis[name].args; } });'],
    ['a conditional', 'page.evaluate(ok ? name => globalThis[name].args : null);'],
  ])('keeps the code of %s', (_name, source) => {
    expect(usagesOf(source).filter(usage => usage.startsWith('dynamic'))).toEqual(hostCode);
  });

  it('keeps the code of a function that the call names', () => {
    const source =
      'function get(name) {\n  return globalThis[name].args;\n}\npage.evaluate(get);\nget(key);';
    expect(usagesOf(source)).toEqual(hostCode);
  });
});
