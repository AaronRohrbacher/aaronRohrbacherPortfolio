import { NextResponse } from 'next/server';
import { createUser, issueTokens } from '@/lib/localAuth';

export async function POST(request) {
  try {
    const { email, password } = await request.json();
    const user = await createUser(email, password);
    const tokens = await issueTokens(user);
    return NextResponse.json(tokens);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
