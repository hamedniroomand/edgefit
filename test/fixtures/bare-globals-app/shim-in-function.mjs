function install() {
  globalThis.document = { title: 'shim' };
}

export const title = document.title;

export { install };
