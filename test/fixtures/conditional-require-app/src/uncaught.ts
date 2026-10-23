export function load(flag: boolean) {
  const name = flag ? 'node:dgram' : 'node:fs';
  return require(name);
}
