export const runtime = 'edge';

// A static import of a Node.js module Vercel lacks does not build in a route, so this one is lazy.
export async function GET() {
  const { setTimeout: later } = await import('node:timers');
  later(() => {}, 1);
  return new Response('timers');
}
