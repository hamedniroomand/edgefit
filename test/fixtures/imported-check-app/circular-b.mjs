import { isDenoA } from './circular-a.mjs';

export const isDenoB = typeof globalThis.Deno !== 'undefined';
export const b = () => (isDenoA ? globalThis.Deno.version : 'none');
