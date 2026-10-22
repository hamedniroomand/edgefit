import { server } from './lib.mjs';

const options = {};
({ http2: options.http2 } = process.env);
server(options, () => {});
