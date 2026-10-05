import { server } from './lib.mjs';

server({ http2: false }, () => {});
