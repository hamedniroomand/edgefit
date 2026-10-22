import { navigatorLock } from '@supabase/auth-js';

const { auth: { lock } = {} } = process.env;

export const run = () => navigatorLock(lock, 0, async () => {});
