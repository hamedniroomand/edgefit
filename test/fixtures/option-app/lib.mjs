import http from 'node:http';
import http2 from 'node:http2';

export function server(options, handler) {
  if (options.http2) {
    return http2.createServer(handler);
  }
  return http.createServer(handler);
}

export function secure(options, handler) {
  if (!options.http2) {
    return http.createServer(handler);
  }
  return http2.createServer(handler);
}
