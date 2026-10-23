export function load(flag: boolean) {
  try {
    return require(flag ? 'node:dgram' : 'node:fs');
  } catch {
    return undefined;
  }
}
