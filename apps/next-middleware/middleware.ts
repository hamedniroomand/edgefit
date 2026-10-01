// Routing Middleware as a Next.js project writes it, with next installed from npm.
import { NextResponse } from 'next/server';

export function middleware() {
  return NextResponse.next();
}
