import { NextResponse } from 'next/server';
import { notifyAaron } from '@/lib/notifyAaron.mjs';

// A-A-Bot's "Leave a message" and "Request contact info" flows both POST
// here. The route delegates to `notifyAaron`, which sends a Resend email if
// RESEND_API_KEY is set AND always appends to .data/notifications.log so
// local dev (and CloudWatch in prod) captures the event either way.
//
// The notification email Aaron receives includes the visitor's IP, OS,
// browser, language, host, referer, and raw user-agent string, plus the
// full payload.
export async function POST(request) {
  try {
    const body = await request.json();
    const { type, name, contactMethod, message, sessionId } = body;

    if (!name || !contactMethod) {
      return NextResponse.json({ error: 'Name and contact method required.' }, { status: 400 });
    }
    if (type !== 'contact_request' && type !== 'message') {
      return NextResponse.json({ error: 'Invalid request type.' }, { status: 400 });
    }
    if (type === 'message' && !message) {
      return NextResponse.json({ error: 'Message required.' }, { status: 400 });
    }

    const result = await notifyAaron({
      request,
      kind: type,
      sessionId,
      payload: { name, contactMethod, message },
    });

    return NextResponse.json({ ok: true, emailed: result.emailed, logged: result.logged });
  } catch (err) {
    console.error('Chat agent API error:', err);
    return NextResponse.json({ error: 'Failed to send. Please try again.' }, { status: 500 });
  }
}
