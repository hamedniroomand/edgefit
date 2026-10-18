import { isDeno } from './flags.mjs';

export const a = flag => {
  const isDeno = flag;
  return isDeno ? globalThis.Deno.version : 'none';
};
export const b = () => (isDeno ? 'none' : globalThis.Deno.version);
