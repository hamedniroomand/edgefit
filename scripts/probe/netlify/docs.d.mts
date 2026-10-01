import type { DriftSection } from '../vercel/docs.mjs';

interface Watched {
  url: string;
  heading: string | undefined;
}
export const watched: {
  runtimeEnvironment: Watched;
  supportedWebApis: Watched;
  limits: Watched;
};
export function extract(markdown: string, heading?: string): string;
export function hashPages(pages: Record<string, string>): Record<string, string>;
export function parseDenoRange(bridgeSource: string): {
  range: string | undefined;
  legacyRange: string | undefined;
};
export function minimumOf(range?: string): string | undefined;
export function compareNetlify(
  observed: { hashes: Record<string, string>; range: string | undefined },
  recorded: { docs: Record<string, string>; bundler: { denoRange: string } },
): DriftSection[];
