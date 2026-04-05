import { NextResponse } from 'next/server';
import { authenticate } from '@/lib/localAuth';

export async function POST(request) {
  try {
    const { email, password } = await request.json();
    const result = await authenticate(email, password);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
}
