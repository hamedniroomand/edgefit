'use strict';

const fs = require('node:fs');

const method = process.argv[2];
fs[method]('.');
fs.watch('.');

exports.safe = function () {
  return 1;
};

exports.statAll = function () {
  return fs.watchFile('.');
};
