import { read, readUnguarded } from './lib.ts';

export default function middleware(): Response {
  return new Response(read() + readUnguarded());
}
