function read(name) {
  return globalThis[name].args;
}

function helper(name) {
  return read(name);
}

export function run(page, key) {
  return page.evaluate(() => helper(key));
}
