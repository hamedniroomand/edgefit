import { join } from '@std/path';
import pool from 'npm:cluster-pool@1.0.0';
import { trackRequests } from 'multi';

import { describe } from '~/lib/describe.ts';

Deno.serve(() => new Response(describe(join('a', String(trackRequests())), pool)));
