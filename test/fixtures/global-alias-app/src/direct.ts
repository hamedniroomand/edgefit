export function load() {
  if (typeof globalThis.Bun !== 'undefined') {
    return require('node:dgram');
  }
  return undefined;
}
