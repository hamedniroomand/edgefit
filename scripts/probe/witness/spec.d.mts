import type { ProbeEntry } from '../probe.mjs';

export type WitnessPlatform = 'netlify' | 'vercel';
export type WitnessSpec = { hash: string; apis: ProbeEntry[] };

export function witnessSpec(platform: WitnessPlatform): WitnessSpec;
