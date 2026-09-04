import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/verifyToken';
import {
  createDumpShareLink,
  getDumpShareLinks,
  deleteDumpShareLink,
  getDump,
} from '@/lib/trackStore';
import { logEvent, EVENT_TYPES, requestMeta } from '@/lib/eventLog';

async function requireAdmin(request) {
  const user = await authenticateRequest(request);
  if (!user?.isAdmin) return null;
  return user;
}

/**
 * POST /api/admin/dump-share-links
 * Create a direct-access share link for a single dump (no account needed).
 * Body: { dumpId, expiresInDays? }
 */
export async function POST(request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Admin required' }, { status: 401 });

  const { dumpId, expiresInDays, label } = await request.json();
  if (!dumpId) return NextResponse.json({ error: 'dumpId required' }, { status: 400 });

  const dump = await getDump(dumpId);
  if (!dump) return NextResponse.json({ error: 'Dump not found' }, { status: 404 });

  const link = await createDumpShareLink(dumpId, admin.email, expiresInDays || null, label?.trim() || dump.name);
  await logEvent({
    type: EVENT_TYPES.SHARE_CREATE,
    actor: admin.email,
    targetType: 'dump',
    targetId: dumpId,
    detail: `expires:${link.expiresAt}`,
    ...requestMeta(request),
  });
  return NextResponse.json({ ok: true, link });
}

/**
 * GET /api/admin/dump-share-links?dumpId=xxx
 * List active share links for a dump.
 */
export async function GET(request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Admin required' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const dumpId = searchParams.get('dumpId');
  if (!dumpId) return NextResponse.json({ error: 'dumpId required' }, { status: 400 });

  const links = await getDumpShareLinks(dumpId);
  return NextResponse.json({ links });
}

/**
 * DELETE /api/admin/dump-share-links?token=xxx
 * Revoke a dump share link.
 */
export async function DELETE(request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Admin required' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });

  await deleteDumpShareLink(token);
  return NextResponse.json({ ok: true });
}
