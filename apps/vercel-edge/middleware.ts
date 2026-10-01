// A Hono app as Vercel Routing Middleware, with hono installed from npm.
import { Hono } from 'hono';
import { handle } from 'hono/vercel';

const app = new Hono();

app.get('/', c => c.text('Hello from the edge'));

export default handle(app);
