import cluster from 'node:cluster';

const stop = () => cluster.fork();

process.addListener('SIGTERM', stop);
process.removeListener('SIGTERM', stop);
