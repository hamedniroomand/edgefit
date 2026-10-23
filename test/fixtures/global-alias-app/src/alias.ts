const g = globalThis;

export function load() {
  if (typeof g.Bun !== 'undefined') {
    return require('node:dgram');
  }
  return undefined;
}
