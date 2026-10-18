export const isDeno = typeof globalThis.Deno !== 'undefined';
const isDenoHere = typeof globalThis.Deno < 'u';
export { isDenoHere, isDenoHere as denoFlag };
export let isDenoLet = typeof globalThis.Deno !== 'undefined';
export var isDenoVar = typeof globalThis.Deno !== 'undefined';
let isDenoLate = typeof globalThis.Deno !== 'undefined';
export { isDenoLate };
export const isDenoHelper = () => typeof globalThis.Deno !== 'undefined';
export default isDeno;
