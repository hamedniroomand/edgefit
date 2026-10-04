const cp = require('node:child_process');
module.exports = { value: 1 };
require.main === module && cp.spawn('command');
