import cluster from 'node:cluster';

export class Server {
  start() {
    this.register(['SIGINT', 'exit']);
  }

  register(signals) {
    const stop = () => {
      cluster.fork();
    };
    signals.forEach(signal => {
      process.on(signal, stop);
    });
  }
}
