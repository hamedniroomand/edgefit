export const staticModule = require('./static.cjs');
export const dynamicModule = require(globalThis.moduleName);
try {
  require(globalThis.other);
} catch {}
