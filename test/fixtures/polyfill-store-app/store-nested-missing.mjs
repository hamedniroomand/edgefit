import fs from 'node:fs';

globalThis.Bun ??= { x: (globalThis.Deno ??= fs.watch('.')) };
