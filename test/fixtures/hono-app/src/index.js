import { Hono } from 'hono';
import { logger } from 'hono/logger';

const app = new Hono();
app.use(logger());
app.get('/', context => context.text('ok'));

export default app;
