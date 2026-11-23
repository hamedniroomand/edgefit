import { describe, expect, it } from 'vite-plus/test';

import { usagesOf } from '~/helpers.ts';

const startup = (source: string): string[] =>
  usagesOf(`import v8 from 'node:v8';\n${source}`).filter(usage => usage.includes('.X'));

const guarded = ['api node:v8.startupSnapshot.X [guarded]'];
const unguarded = ['api node:v8.startupSnapshot.X'];

describe('a use of the result of `x.y?.()` that throws on undefined', () => {
  it.each([
    ['destructuring an object', 'const { a } = v8.startupSnapshot.X?.();'],
    ['destructuring a list', 'const [a] = v8.startupSnapshot.X?.();'],
    ['an assignment to a pattern', 'let a;\n({ a } = v8.startupSnapshot.X?.());'],
    ['new', 'new (v8.startupSnapshot.X?.())();'],
    ['a call', '(v8.startupSnapshot.X?.())();'],
    ['for … of', 'for (const v of v8.startupSnapshot.X?.()) {}'],
    ['a spread into a list', 'const list = [...v8.startupSnapshot.X?.()];'],
    ['a spread into a call', 'Math.max(...v8.startupSnapshot.X?.());'],
    ['a member read after the chain', 'const a = (v8.startupSnapshot.X?.()).a;'],
    ['destructuring a member that the chain reads', 'const { a } = v8.startupSnapshot.X?.().b;'],
    [
      'iterating a member that the chain reads',
      'for (const v of v8.startupSnapshot.X?.().items) {}',
    ],
    ['destructuring an awaited result', 'const { a } = await v8.startupSnapshot.X?.();'],
    ['destructuring a branch of ?:', 'const { a } = c ? v8.startupSnapshot.X?.() : {};'],
    ['destructuring the right side of ||', 'const { a } = c || v8.startupSnapshot.X?.();'],
    ['in', "const has = 'a' in v8.startupSnapshot.X?.();"],
    ['instanceof', 'const is = v instanceof v8.startupSnapshot.X?.();'],
    ['a destructured default', 'function f({ a } = v8.startupSnapshot.X?.()) {}'],
    ['a tagged template', 'const t = (v8.startupSnapshot.X?.())`t`;'],
    ['yield*', 'function* g() {\n  yield* v8.startupSnapshot.X?.();\n}'],
  ])('is a finding for %s', (_name, source) => {
    expect(startup(source)).toEqual(unguarded);
  });
});

describe('a use of the result of `x.y?.()` that never throws', () => {
  it.each([
    ['the call alone', 'v8.startupSnapshot.X?.();'],
    ['a name that keeps it', 'const a = v8.startupSnapshot.X?.();'],
    ['a member read inside the chain', 'const a = v8.startupSnapshot.X?.().a;'],
    ['an optional read', 'const a = v8.startupSnapshot.X?.()?.a;'],
    ['a ?? fallback', 'const a = v8.startupSnapshot.X?.() ?? [];'],
    ['a spread into an object', 'const o = { ...v8.startupSnapshot.X?.() };'],
    ['an optional call of it', '(v8.startupSnapshot.X?.())?.();'],
    ['a call inside the chain', 'v8.startupSnapshot.X?.()();'],
    ['a non-null member read inside the chain', 'const a = v8.startupSnapshot.X?.()!.a;'],
    ['a member that the chain reads, kept', 'const a = v8.startupSnapshot.X?.().b;'],
    ['the left side of ||', 'const a = v8.startupSnapshot.X?.() || [];'],
    ['an optional read after the chain', 'const a = (v8.startupSnapshot.X?.())?.a;'],
  ])('stays guarded for %s', (_name, source) => {
    expect(startup(source)).toEqual(guarded);
  });
});
