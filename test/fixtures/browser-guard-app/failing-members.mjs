const C = globalThis.document;
export function run() {
  globalThis.Bun(1);
  new globalThis.HTMLAnchorElement();
  return [globalThis.window.name, C.visibilityState];
}
