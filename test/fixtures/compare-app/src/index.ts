import { readFile, watch } from 'node:fs';

export function reload(file: string, onChange: (text: string) => void): void {
  watch(file, () => {
    readFile(file, 'utf8', (_error, text) => onChange(text));
  });
}
