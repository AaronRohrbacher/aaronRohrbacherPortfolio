import { NextResponse } from 'next/server';
import { notifyAaron } from '@/lib/notifyAaron.mjs';
import { logEvent, EVENT_TYPES, requestMeta } from '@/lib/eventLog';

export async function POST(request) {
  try {
    const { stage, email } = await request.json();
    const normalized = String(email || '').trim().toLowerCase();
    if (!['submitted', 'confirmed'].includes(stage) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
      return NextResponse.json({ error: 'Invalid signup notification' }, { status: 400 });
    }
    await Promise.all([
      logEvent({
        type: stage === 'confirmed' ? EVENT_TYPES.SIGN_UP_CONFIRMED : EVENT_TYPES.SIGN_UP,
        actor: normalized,
        detail: stage,
        ...requestMeta(request),
      }),
      notifyAaron({ request, kind: `music_signup_${stage}`, payload: { email: normalized } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Invalid signup notification' }, { status: 400 });
  }
}
