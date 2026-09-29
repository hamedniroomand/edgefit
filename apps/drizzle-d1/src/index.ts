import { drizzle } from 'drizzle-orm/d1';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
});

export default {
  async fetch(request: Request, env: { DB: D1Database }): Promise<Response> {
    const db = drizzle(env.DB);
    return Response.json(await db.select().from(users).all());
  },
};
