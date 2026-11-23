import fs from 'node:fs';

globalThis.Bun ??= { x: (globalThis.fetch ??= fs.watch('.')) };
