export function start() {
  if (typeof AudioContext === 'undefined') {
    throw new Error('needs the Web Audio API');
  }
  return URL.createObjectURL(new Blob(['x']));
}
