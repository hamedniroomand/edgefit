const globalAny = globalThis;
const doc = globalThis.document;

export function hooks(check) {
  return check(Boolean(globalAny.Deno));
}

export function visible() {
  if (doc && doc.visibilityState === 'visible') return 1;
  return Boolean(doc) || doc === null;
}

export function tests(other) {
  if (globalThis.document) return 1;
  while (globalThis.document) break;
  return [
    Boolean(globalThis.document),
    globalThis.document === other,
    globalThis.document != undefined,
    globalThis.document ? 1 : 2,
    !globalThis.document,
    globalThis.document && 1,
    globalThis.document ?? null,
    globalThis.document?.title,
  ];
}
