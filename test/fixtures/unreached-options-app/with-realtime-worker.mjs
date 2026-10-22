import RealtimeClient from '@supabase/realtime-js';

const options = { realtime: { worker: true } };

export const client = new RealtimeClient('wss://example.com', options.realtime);
