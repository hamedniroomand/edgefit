import { exec } from 'node:child_process';
import { createSocket } from 'node:dgram';

export function run(): void {
  exec('ls');
  createSocket('udp4').send('ping', 41234, 'localhost');
  console.log(process.release.lts);
}
