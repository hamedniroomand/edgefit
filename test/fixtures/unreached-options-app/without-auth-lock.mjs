import { navigatorLock } from '@supabase/auth-js';

export const run = () => navigatorLock('session', 0, async () => {});
