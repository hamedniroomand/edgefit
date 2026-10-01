import { watchFile } from 'node:fs';

import { shared } from './shared.ts';

export default (): unknown => [shared(), watchFile];
