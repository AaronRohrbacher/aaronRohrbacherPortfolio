import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/verifyToken';
import {
  createMagicLink,
  getMagicLinksForUser,
  deleteMagicLink,
  getTrack,
  getDumpByHandle,
  safeMagicDestination,
} from '@/lib/trackStore';

async function requireAdmin(request) {
  const user = await authenticateRequest(request);
  if (!user?.isAdmin) return null;
  return user;
}

function decodePathPart(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

/**
 * POST /api/admin/magic-links
 * Create a magic login link for a user.
 * Body: { email, expiresInDays? }
 */
export async function POST(request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Admin required' }, { status: 401 });

  const { email, expiresInDays, label, destination, maxUses } = await request.json();
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

  const safeDestination = safeMagicDestination(destination || '/');
  let resolvedLabel = label?.trim() || null;
  if (!resolvedLabel) {
    const trackMatch = safeDestination.match(/^\/track\/([^/?#]+)/);
    const dumpMatch = safeDestination.match(/^\/dump\/([^/?#]+)/);
    if (trackMatch) resolvedLabel = (await getTrack(decodePathPart(trackMatch[1])))?.name || null;
    if (dumpMatch) resolvedLabel = (await getDumpByHandle(decodePathPart(dumpMatch[1])))?.name || null;
  }

  const link = await createMagicLink(
    email,
    admin.email,
    expiresInDays == null ? 7 : expiresInDays,
    resolvedLabel || `Login for ${email}`,
    safeDestination,
    maxUses == null ? 1 : maxUses,
  );
  return NextResponse.json({ ok: true, link });
}

/**
 * GET /api/admin/magic-links?email=xxx
 * List active magic links for a user.
 */
export async function GET(request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Admin required' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

  const links = await getMagicLinksForUser(email);
  return NextResponse.json({ links });
}

/**
 * DELETE /api/admin/magic-links?token=xxx
 * Revoke a magic link.
 */
export async function DELETE(request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Admin required' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });

  await deleteMagicLink(token);
  return NextResponse.json({ ok: true });
}
