const IS_CLIENT = typeof window !== 'undefined';
const _navigator = typeof navigator === 'object' ? navigator : { userAgent: '' };

function downloadSaveAs(blob, name = 'download') {
  const a = document.createElement('a');
  a.download = name;
  a.href = URL.createObjectURL(blob);
  setTimeout(function () {
    URL.revokeObjectURL(a.href);
  }, 4e4);
}

function msSaveAs(blob, name = 'download') {
  navigator.msSaveOrOpenBlob(blob, name);
}

function fileSaverSaveAs(blob) {
  const url = URL.createObjectURL(blob);
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 4e4);
}

const saveAs = !IS_CLIENT
  ? () => {}
  : typeof HTMLAnchorElement !== 'undefined' && 'download' in HTMLAnchorElement.prototype
    ? downloadSaveAs
    : 'msSaveOrOpenBlob' in _navigator
      ? msSaveAs
      : fileSaverSaveAs;

export function exportState(state) {
  saveAs(new Blob([JSON.stringify(state)]), 'pinia-state.json');
}
