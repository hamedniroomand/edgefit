// Layout of an adapter's `_worker.js` directory: an entry that imports a chunk. Hand-written, not real adapter output.
import { watch } from './chunks/watch.js';

export default { fetch: () => new Response(String(watch)) };
