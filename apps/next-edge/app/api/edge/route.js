export const runtime = 'edge';

export function GET() {
  return new Response(Buffer.from('edge').toString('base64'));
}
