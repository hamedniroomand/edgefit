let scope = globalThis;
scope = {};

export function config() {
  if (!scope.FileList) return false;
  return scope.FileList.prototype;
}
