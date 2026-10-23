if (typeof document === 'undefined') {
  globalThis.document = { title: 'shim' };
}

export const title = document.title;
