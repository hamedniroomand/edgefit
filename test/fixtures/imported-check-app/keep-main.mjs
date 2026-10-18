import isDenoDefault, * as flags from './flags.mjs';
import { isDenoHelper, isDenoLate, isDenoLet, isDenoVar } from './flags.mjs';
import otherDefault from './default-flag.mjs';
import { isDeno as starred } from './star.mjs';
import cjs from './cjs-flag.cjs';

export const a = () => (isDenoLet ? globalThis.Deno.version : 'none');
export const b = () => (isDenoVar ? globalThis.Deno.version : 'none');
export const c = () => (isDenoLate ? globalThis.Deno.version : 'none');
export const d = () => (isDenoHelper() ? globalThis.Deno.version : 'none');
export const e = () => (isDenoDefault ? globalThis.Deno.version : 'none');
export const f = () => (flags.isDeno ? globalThis.Deno.version : 'none');
export const g = () => (otherDefault ? globalThis.Deno.version : 'none');
export const h = () => (starred ? globalThis.Deno.version : 'none');
export const i = () => (cjs.isDeno ? globalThis.Deno.version : 'none');
export const j = () => (isDenoLet ?? globalThis.Deno.version);
