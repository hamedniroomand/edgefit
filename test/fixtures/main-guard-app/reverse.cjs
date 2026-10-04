const cp = require('node:child_process');
module.exports = { value: 1 };
module === require.main && cp.spawn('command');
