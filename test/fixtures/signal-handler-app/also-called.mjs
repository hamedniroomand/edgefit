import cluster from 'node:cluster';

function stop() {
  cluster.fork();
}

process.on('SIGTERM', stop);
stop();
