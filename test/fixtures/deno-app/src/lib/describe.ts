import { isString } from 'node:util';

export function describe(value: unknown, extra: unknown): string {
  return isString(value) ? value : String(extra);
}
