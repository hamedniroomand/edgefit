import { isDeno, relayed } from './relay.mjs';

export const a = () => (isDeno ? globalThis.Deno.version : 'none');
export const b = () => (relayed ? globalThis.Deno.version : 'none');
