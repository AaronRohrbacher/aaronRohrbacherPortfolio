import { Resend } from 'resend';
import { NextResponse } from 'next/server';

// Logs chat messages from the in-browser AI chat to CloudWatch (via console.log
// — captured automatically when deployed as a Lambda via SST) and sends a
// single notification email per chat session.
//
// POST body: { sessionId, role: 'user'|'assistant', content, firstMessage?: boolean }
export async function POST(request) {
  try {
    const body = await request.json();
    const { sessionId, role, content, firstMessage } = body;

    if (!sessionId || !role || typeof content !== 'string') {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // Structured log line — CloudWatch Logs Insights can parse this
    console.log(JSON.stringify({
      event: 'chat_message',
      sessionId,
      role,
      content,
      timestamp: new Date().toISOString(),
    }));

    // Send notification email on the first message of each session
    if (firstMessage) {
      const apiKey = process.env.RESEND_API_KEY;
      if (apiKey) {
        try {
          const resend = new Resend(apiKey);
          await resend.emails.send({
            from: 'Portfolio AI Agent <onboarding@resend.dev>',
            to: 'rohrbac@gmail.com',
            subject: 'PORTFOLIO APP CHAT USAGE',
            text: `A new chat session started on your portfolio.\n\nSession ID: ${sessionId}\nTime: ${new Date().toISOString()}\nFirst message (${role}): ${content}\n\nFull conversation will appear in CloudWatch logs under this session ID.`,
          });
        } catch (err) {
          console.error('Chat log email failed:', err);
          // Don't fail the whole request — logging is more important than email
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Chat log error:', err);
    return NextResponse.json({ error: 'Log failed' }, { status: 500 });
  }
}
