import type { ApiRef } from '@/types.ts';

/**
 * The functions outside a `promises` path that give a promise, as the module and then the path.
 * The `(bytes)` leaf of `WebAssembly.instantiate` is not in the list, because edgefit records it
 * on the call and does not see an `await` there.
 */
const promiseFunctions: readonly (readonly string[])[] = [
  ['*globals*', 'WebAssembly', 'compile'],
  ['*globals*', 'WebAssembly', 'compileStreaming'],
  ['*globals*', 'WebAssembly', 'instantiate'],
  ['*globals*', 'WebAssembly', 'instantiateStreaming'],
  ['*globals*', 'fetch'],
  ['fs', 'openAsBlob'],
  ['events', 'once'],
];

/**
 * Whether the API gives a promise, so an error of it is a rejection. The data does not say it, so
 * this reads the name: a `promises` module or path, `crypto.subtle`, or a function of
 * `promiseFunctions`.
 * ponytail: another function that gives a promise counts as sync. Add a field to the data to cover it.
 */
export function isPromiseApi(ref: ApiRef): boolean {
  const parts = [ref.module, ...ref.path];
  return (
    ref.module.endsWith('/promises') ||
    ref.path.includes('promises') ||
    ref.path.includes('subtle') ||
    promiseFunctions.some(
      api => api.length === parts.length && api.every((part, index) => part === parts[index]),
    )
  );
}
