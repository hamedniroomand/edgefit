if (typeof document === 'undefined') {
  throw new Error('needs a browser');
}

export const title = document.title;
