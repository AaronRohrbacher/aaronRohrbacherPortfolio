import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/verifyToken';
import { loadDumps, saveDump, deleteDump, getDumpTracks } from '@/lib/trackStore';
import { invalidatePublicMusic } from '@/lib/musicCache';

async function requireAdmin(request) {
  const user = await authenticateRequest(request);
  if (!user?.isAdmin) return null;
  return user;
}

/**
 * GET /api/admin/dumps — List all dumps with their tracks
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
 * POST /api/admin/dumps — Create or update a dump
 * Body: { id?, name, description, artists, visibility, published }
 */
export async function POST(request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Batch reorder path: { dumps: [{ id, order }, ...] } — only persists the
    // order field on each row (plus whatever else the client sent). Used by
    // the admin Dumps tab's move up/down buttons so a single drag updates
    // multiple rows in one call.
    if (Array.isArray(body.dumps)) {
      const all = await loadDumps();
      const byId = new Map(all.map((d) => [d.id, d]));
      const saved = [];
      for (const patch of body.dumps) {
        const existing = byId.get(patch.id);
        if (!existing) continue;
        const merged = { ...existing, ...patch };
        saved.push(await saveDump(merged));
      }
      invalidatePublicMusic({ dumpHandles: saved.flatMap((d) => [d.id, d.slug]) });
      return NextResponse.json({ dumps: saved });
    }

    const dump = {
      id: body.id || `dump-${Date.now()}`,
      name: body.name || 'Untitled',
      description: body.description || '',
      artists: body.artists || '',
      visibility: body.visibility || 'public',
      published: body.published ?? false,
      createdAt: body.createdAt || new Date().toISOString(),
      slug: body.slug || null,
      order: Number.isFinite(body.order) ? body.order : 0,
    };
    // saveDump generates / uniques the slug and returns the persisted shape
    // (including updatedAt). Use that so the client sees the final slug.
    const saved = await saveDump(dump);
    invalidatePublicMusic({ dumpHandles: [saved.id, saved.slug] });
    return NextResponse.json({ dump: saved });
  } catch (err) {
    console.error('Create dump error:', err);
    return NextResponse.json({ error: 'Failed to create dump' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/dumps?id=xxx — Delete a dump (unlinks tracks)
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
    const existing = (await loadDumps()).find((dump) => dump.id === id);
    await deleteDump(id);
    invalidatePublicMusic({ dumpHandles: [id, existing?.slug] });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Delete dump error:', err);
    return NextResponse.json({ error: 'Failed to delete dump' }, { status: 500 });
  }
}
