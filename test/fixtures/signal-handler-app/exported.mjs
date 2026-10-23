import cluster from 'node:cluster';

export function stop() {
  cluster.fork();
}

process.on('SIGTERM', stop);
