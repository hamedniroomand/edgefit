import cluster from 'node:cluster';

const make = value => () => value;

process.on('SIGTERM', make(cluster.fork()));
