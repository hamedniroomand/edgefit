import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vite-plus/test';

import { readWranglerConfig } from '@/targets/workerd/wrangler.ts';

function write(name: string, text: string): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'edgefit-wrangler-')), name);
  writeFileSync(file, text);
  return file;
}

describe('reading a wrangler config', () => {
  it('reads main and compatibility settings from toml', () => {
    const file = write(
      'wrangler.toml',
      'main = "src/index.ts"\ncompatibility_date = "2026-04-24"\ncompatibility_flags = ["nodejs_compat"]\n',
    );
    expect(readWranglerConfig(file)).toMatchObject({
      file,
      main: 'src/index.ts',
      compatibilityDate: '2026-04-24',
      compatibilityFlags: ['nodejs_compat'],
    });
  });

  it('reads main and compatibility settings from jsonc', () => {
    const file = write(
      'wrangler.jsonc',
      '{ // entry\n  "main": "src/index.ts",\n  "compatibility_date": "2026-04-24",\n  "compatibility_flags": ["nodejs_compat",],\n}\n',
    );
    expect(readWranglerConfig(file)).toMatchObject({
      file,
      main: 'src/index.ts',
      compatibilityDate: '2026-04-24',
      compatibilityFlags: ['nodejs_compat'],
    });
  });

  it('reads the Pages build output folder', () => {
    expect(
      readWranglerConfig(write('wrangler.jsonc', '{ "pages_build_output_dir": "dist" }')),
    ).toMatchObject({ pagesBuildOutputDir: 'dist', main: undefined });
    expect(
      readWranglerConfig(write('wrangler.toml', 'pages_build_output_dir = "dist"\n')),
    ).toMatchObject({ pagesBuildOutputDir: 'dist' });
  });

  it('names the file when the toml is not valid', () => {
    const file = write('wrangler.toml', 'main = [\n');
    expect(() => readWranglerConfig(file)).toThrow(`Could not parse ${file}`);
  });
});
