import { overallStatus } from './result.ts';
import type { PackageResult, PackageStatus } from './result.ts';
import { statusSymbols } from './text.ts';

const colors: Record<PackageStatus, string> = {
  pass: '#3c9a5f',
  warn: '#c99a1c',
  fail: '#c8443b',
  error: '#7b8794',
};

const shieldsColors: Record<PackageStatus, string> = {
  pass: 'brightgreen',
  warn: 'yellow',
  fail: 'red',
  error: 'lightgrey',
};

// Verdana 11px is about 7px per character; padded like shields does, without measuring fonts.
const charWidth = 7;
const padding = 10;
const badgeSymbols: Record<PackageStatus, string> = { ...statusSymbols, warn: '!' };

export interface BadgeOptions {
  /** Show only this target, the `<name>/<target>.svg` variant. */
  target?: string;
}

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function segmentsOf(
  result: PackageResult,
  options: BadgeOptions,
): { key: string; status: PackageStatus }[] {
  const keys = options.target === undefined ? result.targets : [options.target];
  return keys.flatMap(key => {
    const status = result.summary[key as keyof typeof result.summary];
    return status === undefined ? [] : [{ key, status }];
  });
}

/** The badge text: `workerd ✓ bun ✓ deno ⚠`. */
export function badgeMessage(result: PackageResult, options: BadgeOptions = {}): string {
  return segmentsOf(result, options)
    .map(({ key, status }) => `${key} ${statusSymbols[status]}`)
    .join(' ');
}

/** A static SVG, one colored segment per target. Warnings are amber, never green. */
export function renderBadge(result: PackageResult, options: BadgeOptions = {}): string {
  const label = 'edgefit';
  const labelWidth = label.length * charWidth + padding * 2;
  const segments = segmentsOf(result, options).map(({ key, status }) => {
    const text = `${key} ${badgeSymbols[status]}`;
    return { text, status, width: text.length * charWidth + padding * 2 };
  });
  const total = labelWidth + segments.reduce((sum, segment) => sum + segment.width, 0);
  const title = escapeXml(`edgefit: ${badgeMessage(result, options)}`);
  let x = labelWidth;
  const rects: string[] = [];
  const texts: string[] = [`<text x="${labelWidth / 2}" y="14">${label}</text>`];
  for (const segment of segments) {
    rects.push(
      `<rect x="${x}" width="${segment.width}" height="20" fill="${colors[segment.status]}"/>`,
    );
    texts.push(`<text x="${x + segment.width / 2}" y="14">${escapeXml(segment.text)}</text>`);
    x += segment.width;
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="20" role="img" aria-label="${title}">` +
    `<title>${title}</title>` +
    `<clipPath id="r"><rect width="${total}" height="20" rx="3"/></clipPath>` +
    `<g clip-path="url(#r)"><rect width="${labelWidth}" height="20" fill="#555"/>${rects.join('')}</g>` +
    `<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">${texts.join('')}</g>` +
    `</svg>\n`
  );
}

/** The endpoint JSON shields.io reads: `https://img.shields.io/endpoint?url=…`. */
export function shieldsEndpoint(
  result: PackageResult,
  options: BadgeOptions = {},
): Record<string, unknown> {
  const segments = segmentsOf(result, options);
  const status =
    options.target === undefined ? overallStatus(result) : (segments[0]?.status ?? 'error');
  return {
    schemaVersion: 1,
    label: 'edgefit',
    message: badgeMessage(result, options),
    color: shieldsColors[status],
  };
}

/** `@scope/name` becomes `scope__name`, so a badge is one flat file. */
export function badgeFileName(name: string): string {
  return name.replace(/^@/u, '').replace('/', '__');
}
