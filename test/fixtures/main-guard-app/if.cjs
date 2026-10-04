const cp = require('node:child_process');
module.exports = { value: 1 };
if (require.main === module) cp.spawn('command');
