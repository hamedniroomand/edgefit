import EventEmitter from 'node:events';
import { inherits } from 'node:util';

class App extends EventEmitter {}

function Legacy() {}
inherits(Legacy, EventEmitter);

export default {
  fetch() {
    return new Response(String(new App().listenerCount('x')));
  },
};
