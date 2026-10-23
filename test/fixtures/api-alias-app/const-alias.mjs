const scope = globalThis;

export function config() {
  if (!scope.FileList) return false;
  return scope.FileList.prototype;
}
