export function load() {
  try {
    require('node:dgram');
    return require('node:fs');
  } catch {
    return undefined;
  }
}
