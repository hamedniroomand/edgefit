import './unknown.js';
import crypto from 'node:crypto';

globalThis.crypto ??= crypto;

export default {
  fetch() {
    return new Response('x');
  },
};
