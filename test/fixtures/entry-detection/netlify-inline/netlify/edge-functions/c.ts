import type { Config } from './x.ts';
export default (): Response => new Response('c');
export const config = { pattern: '/c/*' } satisfies Config;
