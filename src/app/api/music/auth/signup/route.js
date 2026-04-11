import { NextResponse } from 'next/server';
import { createUser, issueTokens } from '@/lib/localAuth';
import { logEvent, EVENT_TYPES, requestMeta } from '@/lib/eventLog';

export async function POST(request) {
  const meta = requestMeta(request);
  try {
    const { email, password } = await request.json();
    const user = await createUser(email, password);
    const tokens = await issueTokens(user);
    await logEvent({ type: EVENT_TYPES.SIGN_UP, actor: email, ...meta });
    return NextResponse.json(tokens);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
