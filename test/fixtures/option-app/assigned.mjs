import { server } from './lib.mjs';

const options = {};
options.http2 = true;
server(options, () => {});
