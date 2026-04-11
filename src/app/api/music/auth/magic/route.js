import { NextResponse } from 'next/server';
import { redeemMagicLink } from '@/lib/trackStore';
import { getUser, issueTokens } from '@/lib/localAuth';
import { logEvent, EVENT_TYPES, requestMeta } from '@/lib/eventLog';

/**
 * GET /api/music/auth/magic?token=xxx
 * Redeem a magic link — returns auth tokens if valid.
 */
export async function GET(request) {
  const meta = requestMeta(request);
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const result = await redeemMagicLink(token, meta);
  if (!result) {
    await logEvent({ type: EVENT_TYPES.MAGIC_REDEEM_FAIL, detail: 'invalid or expired', ...meta });
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 });
  }

  const user = await getUser(result.email);
  if (!user) {
    await logEvent({ type: EVENT_TYPES.MAGIC_REDEEM_FAIL, actor: result.email, detail: 'user missing', ...meta });
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const tokens = await issueTokens(user);
  await logEvent({ type: EVENT_TYPES.MAGIC_REDEEM, actor: result.email, ...meta });
  return NextResponse.json(tokens);
}
