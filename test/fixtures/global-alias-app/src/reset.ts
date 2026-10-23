let g: Record<string, unknown> = globalThis;
g = {};

export function load() {
  if (typeof g.Bun !== 'undefined') {
    return require('node:dgram');
  }
  return undefined;
}
