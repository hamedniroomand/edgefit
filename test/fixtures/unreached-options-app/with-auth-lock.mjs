import { navigatorLock } from '@supabase/auth-js';

export const options = { auth: { lock: navigatorLock } };
