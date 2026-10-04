const commonJS = (init, cache) => () => {
  init((cache = { exports: {} }).exports, cache);
  return cache.exports;
};
const loadCLI = commonJS((exports, module) => {
  const cp = require('node:child_process');
  function execute() { cp.spawn('command'); }
  module.exports = execute;
  require.main === module && execute();
});
const run = loadCLI();
module.exports = { value: 1 };
require.main === module && run();
