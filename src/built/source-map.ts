import { Buffer } from 'node:buffer';
import { existsSync, readFileSync } from 'node:fs';
import { SourceMap } from 'node:module';
import type { SourceMapPayload } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Location } from '@/types.ts';

export interface OriginalPosition {
  /** Absolute path of the original file. */
  file: string;
  line: number;
  column: number;
}

const mappingUrlComment = /\/\/[#@]\s*sourceMappingURL=(\S+)\s*$/u;

// URLs other than `file:`, such as `webpack://`, name no file on disk.
const urlScheme = /^[a-z][\d+.a-z-]*:/iu;

function decodeDataUrl(url: string): string {
  const comma = url.indexOf(',');
  const data = url.slice(comma + 1);
  return url.slice(0, comma).endsWith(';base64')
    ? Buffer.from(data, 'base64').toString('utf8')
    : decodeURIComponent(data);
}

/** The map named by the file's `sourceMappingURL` comment, else the `.map` file next to it. */
function readPayload(file: string): SourceMapPayload | undefined {
  const url = mappingUrlComment.exec(readFileSync(file, 'utf8'))?.[1];
  let text: string;
  if (url?.startsWith('data:') === true) {
    text = decodeDataUrl(url);
  } else {
    const mapFile =
      url === undefined ? `${file}.map` : path.resolve(path.dirname(file), decodeURIComponent(url));
    if (!existsSync(mapFile)) {
      return undefined;
    }
    text = readFileSync(mapFile, 'utf8');
  }
  try {
    return JSON.parse(text) as SourceMapPayload;
  } catch {
    return undefined;
  }
}

/** Maps positions in a built file back to the original files, when the build wrote a sourcemap. */
export class OutputSourceMap {
  readonly #map: SourceMap;
  readonly #directory: string;

  private constructor(map: SourceMap, directory: string) {
    this.#map = map;
    this.#directory = directory;
  }

  public static read(file: string): OutputSourceMap | undefined {
    const payload = readPayload(file);
    if (payload === undefined) {
      return undefined;
    }
    try {
      return new OutputSourceMap(new SourceMap(payload), path.dirname(file));
    } catch {
      return undefined;
    }
  }

  /** True for a map that lists sources without mapping any code to them, as Nitro writes by default. */
  public get dropsMappings(): boolean {
    return this.#map.payload.sources.length > 0 && this.#map.payload.mappings === '';
  }

  /** The original files the output was built from. */
  public get sources(): string[] {
    return this.#map.payload.sources.flatMap(source => this.#resolve(source) ?? []);
  }

  /** The original position of a location in the built file, if the map covers its line. */
  public original(location: Location): OriginalPosition | undefined {
    const entry = this.#map.findEntry(location.line - 1, location.column - 1);
    // `findEntry` falls back to the closest mapping on an earlier line, which is other code.
    if (!('originalSource' in entry) || entry.generatedLine !== location.line - 1) {
      return undefined;
    }
    const file = this.#resolve(entry.originalSource);
    return file === undefined
      ? undefined
      : { file, line: entry.originalLine + 1, column: entry.originalColumn + 1 };
  }

  #resolve(source: string): string | undefined {
    // The payload type declares `sourceRoot`, but most maps leave it out.
    const root = (this.#map.payload.sourceRoot as string | undefined) ?? '';
    const url = root === '' || root.endsWith('/') ? `${root}${source}` : `${root}/${source}`;
    if (url.startsWith('file:')) {
      return fileURLToPath(url);
    }
    // Rollup marks virtual modules with a `\0`.
    if (url.includes('\0') || (!path.isAbsolute(url) && urlScheme.test(url))) {
      return undefined;
    }
    return path.resolve(this.#directory, url);
  }
}
