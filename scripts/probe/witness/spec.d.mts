import type { ProbeEntry } from '../probe.mjs';

export type WitnessPlatform = 'netlify' | 'vercel';
export type WitnessSpec = { hash: string; apis: ProbeEntry[]; globals: string[] };

export function witnessSpec(platform: WitnessPlatform): WitnessSpec;
export const vercelCandidates: string[];
export function vercelGlobals(allowlist?: unknown): string[];
