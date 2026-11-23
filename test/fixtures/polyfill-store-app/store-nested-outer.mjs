import fs from 'node:fs';

globalThis.fetch ??= { x: (globalThis.Bun ??= fs.watch('.')) };
