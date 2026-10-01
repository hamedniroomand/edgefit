import { watch } from 'node:fs';

export const shared = (): unknown => watch('.');
