import cluster from 'node:cluster';
import process from 'node:process';

process.on('SIGHUP', () => cluster.fork());
