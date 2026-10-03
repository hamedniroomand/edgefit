'use strict';

const fs = require('node:fs');

exports.safe = function () {
  return 1;
};

exports.watchAll = function () {
  return fs.watch('.');
};

exports.statAll = function () {
  return fs.watchFile('.');
};
