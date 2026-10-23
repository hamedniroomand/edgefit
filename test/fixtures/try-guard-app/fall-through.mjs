export function config(name) {
  try {
    if (!globalThis.FileList) return false;
  } catch (_) {
    log();
  }
  return globalThis.FileList[name];
}
