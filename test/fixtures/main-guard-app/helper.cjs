const cp = require('node:child_process');
function run() { cp.spawn('command'); }
module.exports = { value: 1 };
require.main === module && run();
