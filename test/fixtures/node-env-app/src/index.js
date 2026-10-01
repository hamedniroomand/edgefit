import lib from 'env-lib';

export default { fetch: () => new Response(String(lib)) };
