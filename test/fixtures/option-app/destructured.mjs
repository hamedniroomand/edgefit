import { server } from './lib.mjs';

const { http2 } = process.env;
const { app: { http2: nested } = {} } = process.env;

function configure({ http2: flag = true }) {
  return flag;
}

configure({});
server({}, () => {});
