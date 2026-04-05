import { Resend } from 'resend';
import { NextResponse } from 'next/server';

export async function POST(request) {
  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.CONTACT_EMAIL_TO;

  if (!apiKey || !toEmail) {
    return NextResponse.json({ error: 'Email service not configured.' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { type, name, contactMethod, message } = body;

    if (!name || !contactMethod) {
      return NextResponse.json({ error: 'Name and contact method required.' }, { status: 400 });
    }

    const resend = new Resend(apiKey);

    if (type === 'contact_request') {
      await resend.emails.send({
        from: 'Portfolio AI Agent <onboarding@resend.dev>',
        to: toEmail,
        subject: `Contact info request from ${name}`,
        text: `${name} requested your contact information via the AI chat agent.\n\nTheir contact: ${contactMethod}\n\nThey'd like you to send them your contact details.`,
      });
      return NextResponse.json({ ok: true });
    }

    if (type === 'message') {
      if (!message) {
        return NextResponse.json({ error: 'Message required.' }, { status: 400 });
      }
      await resend.emails.send({
        from: 'Portfolio AI Agent <onboarding@resend.dev>',
        to: toEmail,
        subject: `Message from ${name} via AI chat`,
        text: `${name} left a message via the AI chat agent.\n\nContact: ${contactMethod}\n\nMessage:\n${message}`,
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Invalid request type.' }, { status: 400 });
  } catch (err) {
    console.error('Chat agent API error:', err);
    return NextResponse.json({ error: 'Failed to send. Please try again.' }, { status: 500 });
  }
}
