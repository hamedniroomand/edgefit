/**
 * Differences between @edge-runtime/vm and Vercel's documentation that are known and explained,
 * so the probe reports only what is new. Each was observed with @edge-runtime/vm 5.0.0.
 */
export const knownDivergences = {
  Buffer: 'the emulator does not define Buffer; Vercel exposes it as a global',
  process: 'the emulator does not define process; Vercel exposes process.env',
  'WebAssembly.compile': 'the emulator compiles WebAssembly from bytes; Vercel disables it',
  'WebAssembly.instantiate':
    'the emulator instantiates from bytes; Vercel allows only imported modules',
};

// Names in the emulator that belong to its own plumbing or to service-worker events, not to code.
const plumbing = new Set([
  'addEventListener',
  'removeEventListener',
  'dispatchEvent',
  'FetchEvent',
]);
export const isPlumbing = name => name.startsWith('__') || plumbing.has(name);

/**
 * Compares what the emulator reports (`names` on its global object, and whether dynamic code
 * throws) with the allowlist. `accepted` is every global the data already keeps.
 */
export function compareEmulator({ names, evalThrows, functionThrows }, documented, accepted) {
  const has = new Set(names);
  const sections = [
    [
      'Documented globals the emulator lacks (it may lag Vercel, or the docs may be wrong)',
      documented.filter(name => !has.has(name) && !(name in knownDivergences)),
    ],
    [
      'Globals the emulator has that the data does not keep (candidates to add to emulatorGlobals)',
      names.filter(name => !accepted.has(name) && !isPlumbing(name)),
    ],
    [
      'Dynamic code the docs disable but the emulator allows',
      [!evalThrows && 'eval', !functionThrows && 'new Function'].filter(Boolean),
    ],
  ];
  return sections
    .filter(([, items]) => items.length > 0)
    .map(([title, items]) => ({ title, items: items.sort() }));
}
