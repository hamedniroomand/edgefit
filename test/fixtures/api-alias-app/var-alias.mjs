var root = typeof window !== 'undefined' ? window : globalThis;

export function config() {
  if (!root.FileList) return false;
  return root.FileList.prototype;
}
