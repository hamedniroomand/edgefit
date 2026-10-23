export function packageArgs(entry: {
  name: string;
  skip?: readonly string[];
  main?: string;
}): string[];
