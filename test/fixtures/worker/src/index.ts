import { Buffer } from 'node:buffer';
import path from 'node:path';

import { describeRuntime } from 'dual-runtime';
import { connect, loadNative } from 'pg-lite';

import { reload } from './dev/reload.ts';

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.url.endsWith('/reload')) {
      reload();
    }
    const body = Buffer.from(path.join('a', describeRuntime())).toString('base64');
    await connect();
    void loadNative;
    return new Response(body);
  },
};
