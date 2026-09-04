import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/verifyToken';
import {
  listAllShareLinks,
  updateShareLink,
  deleteMagicLink,
  deleteDumpShareLink,
  deleteTrackShareLink,
} from '@/lib/trackStore';

async function requireAdmin(request) {
  const user = await authenticateRequest(request);
  if (!user?.isAdmin) return null;
  return user;
}

/**
 * GET /api/admin/share-links
 * Returns every share link in the system (login + dump + track), including
 * inactive and expired ones — the admin tab handles filtering on the client.
 */
export async function GET(request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Admin required' }, { status: 401 });

  const links = await listAllShareLinks();
  links.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return NextResponse.json({ links });
}

/**
 * PATCH /api/admin/share-links
 * Edit a share link's mutable fields (label, active, expiresAt/expiresInDays).
 * Body: { kind, token, label?, active?, expiresInDays?, expiresAt? }
 * Target id (email/dumpId/trackId) is immutable.
 */
export async function PATCH(request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Admin required' }, { status: 401 });

  const body = await request.json();
  const { kind, token, ...patch } = body;
  if (!kind || !token) {
    return NextResponse.json({ error: 'kind and token required' }, { status: 400 });
  }
  if (!['login', 'dump', 'track'].includes(kind)) {
    return NextResponse.json({ error: 'Invalid kind' }, { status: 400 });
  }

  const updated = await updateShareLink(kind, token, patch);
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, link: updated });
}

/**
 * DELETE /api/admin/share-links?kind=login|dump|track&token=xxx
 * Delete a share link of any kind.
 */
export async function DELETE(request) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Admin required' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get('kind');
  const token = searchParams.get('token');
  if (!kind || !token) {
    return NextResponse.json({ error: 'kind and token required' }, { status: 400 });
  }

  if (kind === 'login') await deleteMagicLink(token);
  else if (kind === 'dump') await deleteDumpShareLink(token);
  else if (kind === 'track') await deleteTrackShareLink(token);
  else return NextResponse.json({ error: 'Invalid kind' }, { status: 400 });

  return NextResponse.json({ ok: true });
}
