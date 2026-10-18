import v8 from 'node:v8';
import { isMainThread } from 'node:worker_threads';

export const heap = v8.getHeapStatistics();
export const main = isMainThread;
export const read = key => v8[key];
