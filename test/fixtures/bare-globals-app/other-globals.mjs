export function check() {
  if (!FileReader) {
    return 1;
  }
  return FileList ? 2 : 3;
}

export const isList = value => value instanceof FileList;
