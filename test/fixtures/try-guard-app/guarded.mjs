export function config(name) {
  try {
    if (!globalThis.FileList) return false;
  } catch (_) {
    return false;
  }
  return globalThis.FileList[name];
}
