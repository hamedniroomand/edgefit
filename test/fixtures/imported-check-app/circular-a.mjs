import { isDenoB } from './circular-b.mjs';

export const isDenoA = typeof globalThis.Deno !== 'undefined';
export const a = () => (isDenoB ? globalThis.Deno.version : 'none');
