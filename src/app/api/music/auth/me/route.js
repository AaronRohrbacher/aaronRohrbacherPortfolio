import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/verifyToken';

export async function GET(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return NextResponse.json({ user: null });
  }
  // Accept local-development JWTs, Cognito JWTs, and the short-lived
  // application sessions issued when a user redeems a magic login link.
  const user = await verifyToken(token);
  return NextResponse.json({ user });
}
