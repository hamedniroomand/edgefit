import cluster from 'node:cluster';

process.on('exit', () => cluster.fork());
