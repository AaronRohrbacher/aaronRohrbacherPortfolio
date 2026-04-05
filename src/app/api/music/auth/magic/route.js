import { NextResponse } from 'next/server';
import { redeemMagicLink } from '@/lib/trackStore';
import { getUser, issueTokens } from '@/lib/localAuth';

/**
 * GET /api/music/auth/magic?token=xxx
 * Redeem a magic link — returns auth tokens if valid.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const result = await redeemMagicLink(token);
  if (!result) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 });
  }

  const user = await getUser(result.email);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const tokens = await issueTokens(user);
  return NextResponse.json(tokens);
}
