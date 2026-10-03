import { createServer } from 'mini-sql';

export default { fetch: () => new Response(String(createServer)) };
