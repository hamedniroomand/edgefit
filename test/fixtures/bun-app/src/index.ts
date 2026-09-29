import { serve } from 'bun';
import { trackRequests } from 'multi-runtime';

serve({ fetch: () => new Response(String(trackRequests())) });
