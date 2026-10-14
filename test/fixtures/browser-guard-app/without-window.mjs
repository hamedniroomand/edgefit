export function save(blob) {
  if (typeof window === 'undefined') URL.createObjectURL(blob);
}
