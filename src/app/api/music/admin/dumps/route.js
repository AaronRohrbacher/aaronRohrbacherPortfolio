import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/verifyToken';
import { loadDumps, saveDump, deleteDump, getDumpTracks } from '@/lib/trackStore';

async function requireAdmin(request) {
  const user = await authenticateRequest(request);
  if (!user?.isAdmin) return null;
  return user;
}

/**
 * GET /api/music/admin/dumps — List all dumps with their tracks
 */
export async function GET(request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const dumps = await loadDumps();
    const withTracks = await Promise.all(
      dumps.map(async (d) => ({
        ...d,
        tracks: await getDumpTracks(d.id),
      }))
    );
    return NextResponse.json({ dumps: withTracks });
  } catch (err) {
    console.error('List dumps error:', err);
    return NextResponse.json({ error: 'Failed to list dumps' }, { status: 500 });
  }
}

/**
 * POST /api/music/admin/dumps — Create or update a dump
 * Body: { id?, name, description, artists, visibility, published }
 */
export async function POST(request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const dump = {
      id: body.id || `dump-${Date.now()}`,
      name: body.name || 'Untitled',
      description: body.description || '',
      artists: body.artists || '',
      visibility: body.visibility || 'public',
      published: body.published ?? false,
      createdAt: body.createdAt || new Date().toISOString(),
    };
    await saveDump(dump);
    return NextResponse.json({ dump });
  } catch (err) {
    console.error('Create dump error:', err);
    return NextResponse.json({ error: 'Failed to create dump' }, { status: 500 });
  }
}

/**
 * DELETE /api/music/admin/dumps?id=xxx — Delete a dump (unlinks tracks)
 */
export async function DELETE(request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Dump id required' }, { status: 400 });
    }

    // deleteDump unlinks sibling rows and rewrites any legacy main-track rows
    // so they drop the dump assignment. No separate saveTracks pass needed.
    await deleteDump(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Delete dump error:', err);
    return NextResponse.json({ error: 'Failed to delete dump' }, { status: 500 });
  }
}
