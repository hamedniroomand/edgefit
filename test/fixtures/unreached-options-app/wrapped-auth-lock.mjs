import { navigatorLock } from '@supabase/auth-js';

export const config = { supabase: { auth: { lock: navigatorLock } } };
