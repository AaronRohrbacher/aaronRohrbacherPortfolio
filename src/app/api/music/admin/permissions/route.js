import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/verifyToken';
import { getTrackPermissions, grantTrackAccess, revokeTrackAccess } from '@/lib/trackStore';

async function requireAdmin(request) {
  const user = await authenticateRequest(request);
  if (!user?.isAdmin) return null;
  return user;
}

/**
 * GET /api/admin/permissions?trackId=xxx
 */
export async function GET(request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const trackId = searchParams.get('trackId');
  if (!trackId) {
    return NextResponse.json({ error: 'trackId required' }, { status: 400 });
  }

  try {
    const perms = await getTrackPermissions(trackId);
    return NextResponse.json(perms);
  } catch (err) {
    console.error('Get permissions error:', err);
    return NextResponse.json({ error: 'Failed to get permissions' }, { status: 500 });
  }
}

/**
 * PUT /api/admin/permissions
 * Body: { trackId, targetType: "user"|"group", targetId, action: "grant"|"revoke" }
 */
export async function PUT(request) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { trackId, targetType, targetId, action } = await request.json();
    if (!trackId || !targetType || !targetId || !action) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    if (action === 'grant') {
      await grantTrackAccess(trackId, targetType, targetId, admin.email);
    } else if (action === 'revoke') {
      await revokeTrackAccess(trackId, targetType, targetId);
    } else {
      return NextResponse.json({ error: 'action must be grant or revoke' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Permissions error:', err);
    return NextResponse.json({ error: 'Failed to update permissions' }, { status: 500 });
  }
}
