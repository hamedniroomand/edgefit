import cluster from 'node:cluster';

function stop() {
  cluster.fork();
}

process.once('SIGINT', stop);
