export function load(flag: boolean) {
  const name = flag ? 'node:dgram' : 'node:fs';
  try {
    return require(name);
  } catch {
    return undefined;
  }
}
