import fs from 'node:fs';

import { watchAlways } from './always.js';

export default {
  async fetch(request, env, context) {
    // fs.watch exists on Workers and throws, so checking for it protects nothing.
    if (typeof fs.watch === 'function') {
      fs.watch('.');
    }
    watchAlways();

    // getPublicKey does not exist on Workers, and this code checks for it first.
    const { subtle } = crypto;
    if (typeof subtle.getPublicKey !== 'function') {
      return 'the key must be extractable';
    }
    return subtle.getPublicKey(request.key, []);
  },
};
