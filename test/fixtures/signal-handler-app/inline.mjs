import cluster from 'node:cluster';

process.on('SIGTERM', () => {
  cluster.fork();
});
