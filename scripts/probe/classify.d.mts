export type Outcome = 'missing' | 'present' | 'unsupported' | 'implemented' | 'inconclusive';

export function isDenied(api: string): boolean;
export function classifyThrown(error: unknown): Exclude<Outcome, 'missing'>;
