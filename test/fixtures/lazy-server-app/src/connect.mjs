import { createConnection } from 'mini-sql';

export default { fetch: () => new Response(String(createConnection)) };
