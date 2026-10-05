import { server } from './lib.mjs';

server({ http2: process.env.H2 }, () => {});
