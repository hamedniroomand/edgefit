import pg from 'pg';

export default {
  async fetch(request, env) {
    const client = new pg.Client({ connectionString: env.DATABASE_URL });
    await client.connect();
    const { rows } = await client.query('select now()');
    await client.end();
    return Response.json(rows);
  },
};
