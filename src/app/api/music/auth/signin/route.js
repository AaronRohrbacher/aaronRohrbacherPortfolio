import { NextResponse } from 'next/server';
import { authenticate } from '@/lib/localAuth';
import { logEvent, EVENT_TYPES, requestMeta } from '@/lib/eventLog';

export async function POST(request) {
  const meta = requestMeta(request);
  let email;
  try {
    const body = await request.json();
    email = body.email;
    const result = await authenticate(body.email, body.password);
    logEvent({ type: EVENT_TYPES.SIGN_IN, actor: body.email, ...meta });
    return NextResponse.json(result);
  } catch (err) {
    logEvent({ type: EVENT_TYPES.SIGN_IN_FAIL, actor: email || null, detail: err.message, ...meta });
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
}
