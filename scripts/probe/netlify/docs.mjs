import { hash, section } from '../vercel/docs.mjs';

const base = 'https://docs.netlify.com/build/edge-functions';

/** The Netlify pages and sections edgefit's data rests on, keyed by the name the data stores. */
export const watched = {
  runtimeEnvironment: { url: `${base}/api.md`, heading: '### Runtime environment' },
  supportedWebApis: { url: `${base}/api.md`, heading: '## Supported web APIs' },
  limits: { url: `${base}/limits.md`, heading: undefined },
};

/** The text of a watched part: a section of a page, or the page without its front matter. */
export function extract(markdown, heading) {
  return heading === undefined
    ? markdown.replace(/^---[\s\S]*?\n---\n/u, '')
    : section(markdown, heading).join('\n');
}

/** Hashes of each watched part, given a map from page URL to its Markdown. */
export function hashPages(pages) {
  return Object.fromEntries(
    Object.entries(watched).map(([name, { url, heading }]) => [
      name,
      hash(extract(pages[url] ?? '', heading)),
    ]),
  );
}

/** `DENO_VERSION_RANGE = '^2.4.2'` in the bundler's bridge, and the legacy range beside it. */
export function parseDenoRange(bridgeSource) {
  const read = name =>
    new RegExp(`(?<![A-Z_])${name}\\s*=\\s*'([^']+)'`, 'u').exec(bridgeSource)?.[1];
  return { range: read('DENO_VERSION_RANGE'), legacyRange: read('LEGACY_DENO_VERSION_RANGE') };
}

/** The oldest Deno a range allows: the first `x.y.z` in it. */
export const minimumOf = range => /\d+\.\d+\.\d+/u.exec(range ?? '')?.[0];

/** Where the pages and the bundler differ from what the data records. */
export function compareNetlify({ hashes, range }, recorded) {
  const changed = Object.keys(watched).filter(name => hashes[name] !== recorded.docs[name]);
  const sections = [];
  if (changed.length > 0) {
    sections.push({
      title:
        'Netlify docs changed (re-read them, then update the hashes in overrides/netlify-edge.json)',
      items: changed,
    });
  }
  if (range !== recorded.bundler.denoRange) {
    sections.push({
      title: `@netlify/edge-bundler now requires Deno ${range}, not ${recorded.bundler.denoRange} (update the netlify-edge version in source.json to ${minimumOf(range)})`,
      items: [`${recorded.bundler.denoRange} -> ${range}`],
    });
  }
  return sections;
}
