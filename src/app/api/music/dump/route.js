import { NextResponse } from 'next/server';
import { getDump, getDumpTracks, getTrackPermissions } from '@/lib/trackStore';
import { authenticateRequest } from '@/lib/verifyToken';

/**
 * GET /api/music/dump?id=xxx
 * Public endpoint for viewing a single dump + its tracks (with permission checks).
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing dump id' }, { status: 400 });
  }

  try {
    const dump = await getDump(id);
    if (!dump) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const user = await authenticateRequest(request);

    // Admins can view any dump regardless of published/visibility state
    if (!user?.isAdmin) {
      if (!dump.published) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }

      const vis = dump.visibility || 'public';

      if (vis === 'authenticated' && !user) {
        return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
      }

      if (vis === 'restricted') {
        if (!user) {
          return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
        }
        const tracks = await getDumpTracks(id);
        if (tracks.length > 0) {
          const perms = await getTrackPermissions(tracks[0].id);
          const hasUserPerm = perms.users.some((p) => p.userId === user.sub || p.userId === user.email);
          const userGroupsLower = user.groups.map((g) => g.toLowerCase());
          const hasGroupPerm = perms.groups.some((p) => userGroupsLower.includes(p.groupName.toLowerCase()));
          if (!hasUserPerm && !hasGroupPerm) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
          }
        }
      }
    }

    const tracks = await getDumpTracks(id);
    const withUrls = tracks.map((track) => ({
      id: track.id,
      name: track.name,
      description: track.description,
      artists: track.artists,
      dumpId: track.dumpId,
      addedAt: track.addedAt,
      formats: Object.keys(track.formats),
      streamUrls: Object.fromEntries(
        Object.keys(track.formats).map((f) => [
          f,
          `/api/music/stream?id=${encodeURIComponent(track.id)}&format=${f}`,
        ])
      ),
    }));

    return NextResponse.json({
      dump: {
        id: dump.id,
        name: dump.name,
        description: dump.description,
        artists: dump.artists,
        visibility: dump.visibility,
      },
      tracks: withUrls,
    });
  } catch (err) {
    console.error('Dump fetch error:', err);
    return NextResponse.json({ error: 'Failed to load dump' }, { status: 500 });
  }
}
