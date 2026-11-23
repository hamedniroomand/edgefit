// The Emscripten test for Node.js, and its browser branch.
var ENVIRONMENT_IS_NODE =
  typeof process == 'object' &&
  typeof process.versions == 'object' &&
  typeof process.versions.node == 'string';

export async function load(url) {
  if (ENVIRONMENT_IS_NODE) {
    return 'node';
  }
  return WebAssembly.instantiateStreaming(fetch(url));
}

// A call that the trace cannot read breaks the chain.
export function helper(url, h) {
  if (typeof process == 'object' && !h()) {
    return 'node';
  }
  return WebAssembly.instantiateStreaming(fetch(url));
}

// A true || chain runs where either runtime is.
export function either(url) {
  if (typeof Deno !== 'undefined' || typeof Bun !== 'undefined') {
    return WebAssembly.instantiateStreaming(fetch(url));
  }
  return 'other';
}
