import { denoFlag, isDeno, isDenoHere as renamed } from './flags.mjs';

export const a = () => (isDeno ? globalThis.Deno.version : 'none');
export const b = () => denoFlag && globalThis.Deno.version;
export const c = () => {
  if (!renamed) return 'none';
  return globalThis.Deno.version;
};
