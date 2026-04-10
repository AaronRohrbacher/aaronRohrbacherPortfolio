import jwt from 'jsonwebtoken';
import { NextResponse } from 'next/server';

const CONNECT_SECRET = process.env.CONNECT_SECURITY_KEY;
const WIDGET_ID = process.env.CONNECT_WIDGET_ID;

export async function GET(request) {
  if (!CONNECT_SECRET || !WIDGET_ID) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  // Capture visitor IP for contact attributes
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';

  const header = { typ: 'JWT', alg: 'HS256' };

  const payload = {
    sub: WIDGET_ID,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 500,
  };

  const encoded_token = jwt.sign(payload, CONNECT_SECRET, {
    algorithm: 'HS256',
    header: header,
  });

  return NextResponse.json({ data: encoded_token, ip });
}
