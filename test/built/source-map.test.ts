import { Buffer } from 'node:buffer';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { OutputSourceMap } from '@/built/source-map.ts';

// Maps line 1, column 0 to line 1, column 0 of the first source, and line 2 to nothing.
const payload = {
  version: 3,
  sources: ['../src/app.ts', '\0virtual:entry'],
  names: [],
  mappings: 'AAAA;',
};

function writeOutput(code: string, files: Record<string, string> = {}): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'edgefit-map-'));
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(path.join(directory, name), text);
  }
  const file = path.join(directory, 'index.mjs');
  writeFileSync(file, code);
  return file;
}

/** A project with its output two folders down, whose map points three levels up for a package. */
function layoutWithMap(): { directory: string; project: string; file: string } {
  const directory = mkdtempSync(path.join(tmpdir(), 'edgefit-map-'));
  const project = path.join(directory, 'project');
  const output = path.join(project, '.out/functions');
  mkdirSync(output, { recursive: true });
  mkdirSync(path.join(directory, 'node_modules/pkg@1'), { recursive: true });
  writeFileSync(path.join(directory, 'node_modules/pkg@1/index.js'), '');
  const file = path.join(output, 'index.js');
  writeFileSync(file, 'run();');
  const sources = ['../../../node_modules/pkg%401/index.js'];
  writeFileSync(`${file}.map`, JSON.stringify({ ...payload, sources }));
  return { directory, project, file };
}

describe('OutputSourceMap', () => {
  it('reads the .map file next to the output', () => {
    const file = writeOutput('watch();\nrun();', { 'index.mjs.map': JSON.stringify(payload) });
    const map = OutputSourceMap.read(file);
    expect(map?.original({ file: 'index.mjs', line: 1, column: 1 })).toEqual({
      file: path.resolve(path.dirname(file), '../src/app.ts'),
      line: 1,
      column: 1,
    });
    // Line 2 has no mapping, so it is not attributed to line 1's source.
    expect(map?.original({ file: 'index.mjs', line: 2, column: 1 })).toBeUndefined();
  });

  it('reads an inline map and leaves virtual sources out', () => {
    const inline = Buffer.from(JSON.stringify({ ...payload, sourceRoot: '/project' })).toString(
      'base64',
    );
    const file = writeOutput(
      `watch();\n//# sourceMappingURL=data:application/json;base64,${inline}\n`,
    );
    expect(OutputSourceMap.read(file)?.sources).toEqual([path.resolve('/project/../src/app.ts')]);
  });

  it('treats a map that lists sources but maps nothing as dropping its mappings', () => {
    const file = writeOutput('watch();', {
      'index.mjs.map': JSON.stringify({ ...payload, mappings: '' }),
    });
    expect(OutputSourceMap.read(file)?.dropsMappings).toBe(true);
  });

  it('returns nothing without a readable map', () => {
    expect(OutputSourceMap.read(writeOutput('watch();'))).toBeUndefined();
    const broken = writeOutput('watch();', { 'index.mjs.map': '{' });
    expect(OutputSourceMap.read(broken)).toBeUndefined();
  });
});

describe('OutputSourceMap sources', () => {
  it('decodes a percent-encoded source, and finds a source that is not where the map says', () => {
    const { directory, project, file } = layoutWithMap();
    const at = { file: 'index.js', line: 1, column: 1 };
    expect(OutputSourceMap.read(file, project)?.original(at)?.file).toBe(
      path.join(directory, 'node_modules/pkg@1/index.js'),
    );
    // Without the project root there is nothing to look in, so the path stays where the map put it.
    expect(OutputSourceMap.read(file)?.original(at)?.file).toBe(
      path.resolve(path.dirname(file), '../../../node_modules/pkg@1/index.js'),
    );
  });

  it('uses a source that is not valid as a URL as it is written', () => {
    const file = writeOutput('watch();', {
      'index.mjs.map': JSON.stringify({ ...payload, sources: ['100%zz.ts'] }),
    });
    const found = OutputSourceMap.read(file)?.original({ file: 'index.mjs', line: 1, column: 1 });
    expect(found?.file).toBe(path.resolve(path.dirname(file), '100%zz.ts'));
  });
});
