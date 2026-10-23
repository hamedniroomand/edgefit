export function read(page, name) {
  return page.evaluate(key => globalThis[key].args, name);
}
