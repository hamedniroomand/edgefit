export function run() {
  const { version } = globalThis.Deno;
  const [first] = globalThis.document;
  return [version, first];
}
