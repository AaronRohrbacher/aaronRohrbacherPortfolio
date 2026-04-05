import { NextResponse } from 'next/server';
import { verifyLocalToken } from '@/lib/localAuth';

export async function GET(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return NextResponse.json({ user: null });
  }
  const user = await verifyLocalToken(token);
  return NextResponse.json({ user });
}
