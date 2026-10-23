export const parse = text => new DOMParser().parseFromString(text, 'text/html');

export const viaGlobal = () => globalThis.DOMParser;

export const safe = typeof DOMParser === 'undefined' ? null : new DOMParser();
