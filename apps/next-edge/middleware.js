import { setTimeout as later } from 'node:timers';
import { NextResponse } from 'next/server';

export function middleware() {
  later(() => {}, 1);
  return NextResponse.next();
}

export const config = { matcher: '/dashboard/:path*' };
