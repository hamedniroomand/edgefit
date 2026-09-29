import { watch } from 'chokidar';
import spawn from 'cross-spawn';

export default {
  fetch() {
    watch('.').on('change', () => spawn('touch', ['reloaded']));
    return new Response('ok');
  },
};
