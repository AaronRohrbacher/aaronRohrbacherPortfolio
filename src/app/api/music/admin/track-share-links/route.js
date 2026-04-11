import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/verifyToken';
import {
  createTrackShareLink,
  getTrackShareLinks,
  deleteTrackShareLink,
  getTrack,
} from '@/lib/trackStore';
import { logEvent, EVENT_TYPES, requestMeta } from '@/lib/eventLog';

async function requireAdmin(request) {
  const user = await authenticateRequest(request);
  if (!user?.isAdmin) return null;
  return user;
}

/**
 * POST /api/music/admin/track-share-links
 * Create a direct-access share link for a single track (no account needed).
 * Body: { trackId, expiresInDays?, label? }
 */
export async function POST(request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Admin required' }, { status: 401 });

  const { trackId, expiresInDays, label } = await request.json();
  if (!trackId) return NextResponse.json({ error: 'trackId required' }, { status: 400 });

  const track = await getTrack(trackId);
  if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 });

  const link = await createTrackShareLink(trackId, admin.email, expiresInDays || null, label || null);
  await logEvent({
    type: EVENT_TYPES.SHARE_CREATE,
    actor: admin.email,
    targetType: 'track',
    targetId: trackId,
    detail: link.expiresAt ? `expires:${link.expiresAt}` : 'no-expiry',
    ...requestMeta(request),
  });
  return NextResponse.json({ ok: true, link });
}

/**
 * GET /api/music/admin/track-share-links?trackId=xxx
 * List active share links for a track.
 */
export async function GET(request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Admin required' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const trackId = searchParams.get('trackId');
  if (!trackId) return NextResponse.json({ error: 'trackId required' }, { status: 400 });

  const links = await getTrackShareLinks(trackId);
  return NextResponse.json({ links });
}

/**
 * DELETE /api/music/admin/track-share-links?token=xxx
 * Revoke a track share link.
 */
export async function DELETE(request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Admin required' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });

  await deleteTrackShareLink(token);
  return NextResponse.json({ ok: true });
}
