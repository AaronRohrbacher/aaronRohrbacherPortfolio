import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/verifyToken';
import { listEvents, deleteEvent } from '@/lib/eventLog';

async function requireAdmin(request) {
  const user = await authenticateRequest(request);
  if (!user?.isAdmin) return null;
  return user;
}

/**
 * GET /api/music/admin/events[?type=xxx&limit=100]
 * List recent auth/content/share events (admin only).
 */
export async function GET(request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'Admin required' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || undefined;
  const limit = Number(searchParams.get('limit') || 100);
  try {
    const events = await listEvents({ type, limit });
    return NextResponse.json({ events });
  } catch (err) {
    console.error('List events failed:', err);
    return NextResponse.json({ error: 'Failed to list events' }, { status: 500 });
  }
}

/**
 * DELETE /api/music/admin/events?sk=xxx
 * Remove a single event entry (admin only).
 */
export async function DELETE(request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'Admin required' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const sk = searchParams.get('sk');
  if (!sk) return NextResponse.json({ error: 'sk required' }, { status: 400 });
  await deleteEvent(sk);
  return NextResponse.json({ ok: true });
}
