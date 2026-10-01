---
'edgefit': minor
---

Every target finds its own entries. Bun reads `package.json` `module`, then the start and dev scripts, then `index.ts`. Deno reads `deno.json` `exports`, then the `start` and `dev` tasks, then `main.ts`. Vercel Edge takes the middleware and every `api/**`, `pages/api/**` and `app/**/route.*` file that sets `runtime: 'edge'`. Netlify Edge also takes functions that export `config` with a `path` or `pattern`. Workerd, Bun and Deno fall back to `package.json` `exports`, `module` and `main`, then `src/index.*` and `index.*`. Entries read from a command or a file name are marked as guessed in the report. Nothing is guessed at a workspace root. See [How entries are found](https://edgefit.kitdev.space/guide/configuration#how-entries-are-found).
