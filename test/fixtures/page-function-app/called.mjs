function read(name) {
  return globalThis[name].args;
}

export function run(page, key) {
  return page.evaluate(() => read(key));
}
