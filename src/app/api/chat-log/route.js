import { NextResponse } from 'next/server';
import { notifyAaron } from '@/lib/notifyAaron.mjs';

// Every A-A-Bot message (user or assistant) is posted here for logging.
// CloudWatch picks up the structured JSON line in prod. Aaron also gets a
// notification email on the FIRST message of each session so he knows
// someone is actively using the chat — not on every follow-up, since a
// single conversation can be 8+ messages.
//
// POST body:
//   { sessionId, role: 'user'|'assistant', content, firstMessage?: boolean }
export async function POST(request) {
  try {
    const body = await request.json();
    const { sessionId, role, content, firstMessage } = body;

    if (!sessionId || !role || typeof content !== 'string') {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // Structured log line — CloudWatch Logs Insights can parse this.
    console.log(JSON.stringify({
      event: 'chat_message',
      sessionId,
      role,
      content,
      timestamp: new Date().toISOString(),
    }));

    // Notify Aaron on the first message of a session. `notifyAaron` handles
    // both the Resend email (when the key is set) and the local-dev file
    // log, so Aaron sees the event either way.
    if (firstMessage) {
      await notifyAaron({
        request,
        kind: 'chat_session',
        sessionId,
        payload: {
          first_message_role: role,
          first_message_content: content,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Chat log error:', err);
    return NextResponse.json({ error: 'Log failed' }, { status: 500 });
  }
}
