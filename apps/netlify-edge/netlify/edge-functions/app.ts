import { Hono } from 'hono';
import { handle } from 'hono/netlify';

const app = new Hono();

app.get('/', c => c.text('Hello from the edge'));

export default handle(app);
