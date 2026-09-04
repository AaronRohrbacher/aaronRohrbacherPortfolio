import { NextResponse } from 'next/server';
import { listBucketTracks } from '@/lib/s3';
import {
  saveTrack,
  saveTracks,
  mergeTracks,
  loadAllTracks,
  loadDumps,
  getDumpTracks,
  getDumpsContainingTrack,
  canViewTrackDirect,
  getPermittedTrackIds,
} from '@/lib/trackStore';
import { authenticateRequest } from '@/lib/verifyToken';
import { invalidatePublicMusic } from '@/lib/musicCache';

/**
 * GET /api/tracks
 * Anonymous: public published tracks
 * Authenticated: public + authenticated + restricted (if permitted)
 * Admin (?raw=1): everything including unpublished, no URLs
 */
export async function GET(request) {
  try {
    const user = await authenticateRequest(request);

    const bucketTracks = await listBucketTracks();
    const saved = await loadAllTracks();
    const merged = mergeTracks(saved, bucketTracks);

    // Persist merge
    await saveTracks(merged);

    // Admin panel requests raw data
    const { searchParams } = new URL(request.url);
    if (searchParams.get('raw') === '1' && user?.isAdmin) {
      const dumps = await loadDumps();
      return NextResponse.json({ tracks: merged, dumps });
    }

    const dumps = await loadDumps();
    const permittedTrackIds = user && !user.isAdmin
      ? await getPermittedTrackIds(user.sub, user.groups, user.email)
      : new Set();

    // DUMP TRUMPS — a track that lives in a dump the viewer can see
    // belongs to the dump branch, never to the loose list. But if ALL of
    // a track's dumps are hidden from this viewer (unpublished, or a
    // visibility tier the viewer lacks), we fall back to the track-side
    // direct check so the track isn't unreachable.
    const viewableDumpIds = new Set(
      dumps
        .filter((d) => {
          if (!d.published) return false;
          if (user?.isAdmin) return true;
          const vis = d.visibility || 'public';
          if (vis === 'public') return true;
          if (vis === 'authenticated' || vis === 'restricted') return !!user;
          return false;
        })
        .map((d) => d.id),
    );

    const isClaimedByViewableDump = (t) =>
      Array.isArray(t.dumpIds) &&
      t.dumpIds.some((id) => viewableDumpIds.has(id));

    const looseAdmits = (t) => {
      if (isClaimedByViewableDump(t)) return false;
      if (user?.isAdmin) return !!t.published;
      return canViewTrackDirect(t, { user, permittedTrackIds });
    };

    const project = (track) => {
      const streamUrls = {};
      for (const format of Object.keys(track.formats)) {
        streamUrls[format] = `/api/stream?id=${encodeURIComponent(track.id)}&format=${format}`;
      }
      return {
        id: track.id,
        name: track.name,
        description: track.description,
        artists: track.artists,
        dumpIds: track.dumpIds || [],
        addedAt: track.addedAt,
        formats: Object.keys(track.formats),
        streamUrls,
      };
    };

    const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);

    const loose = merged
      .filter(looseAdmits)
      .slice()
      .sort(byOrder)
      .map(project);

    // First narrow the dumps the viewer can see, ignoring restricted-tier
    // for now — we resolve those after we know each dump's track list.
    const baselineViewableDumps = dumps.filter((d) => {
      if (!d.published) return false;
      if (user?.isAdmin) return true;
      const vis = d.visibility || 'public';
      if (vis === 'public') return true;
      if (vis === 'authenticated') return !!user;
      if (vis === 'restricted') return !!user;
      return false;
    });

    // Walk the dump-side index. The dump owns its tracks; we re-hydrate
    // each through `merged` to pick up current S3 formats and drop any
    // whose audio file is gone.
    const mergedById = new Map(merged.map((t) => [t.id, t]));
    const dumpTracksByDumpId = {};
    for (const dump of baselineViewableDumps) {
      const dumpTracks = await getDumpTracks(dump.id);
      dumpTracksByDumpId[dump.id] = dumpTracks
        .map((t) => mergedById.get(t.id))
        .filter(Boolean);
    }

    // Restricted dumps require the viewer to have perms on at least one
    // track inside the dump. permittedTrackIds is already loaded — just
    // intersect against the dump's tracks.
    const allowedDumps = [];
    for (const dump of baselineViewableDumps) {
      const tracksInDump = dumpTracksByDumpId[dump.id];
      if (tracksInDump.length === 0) continue;
      const vis = dump.visibility || 'public';
      if (!user?.isAdmin && vis === 'restricted') {
        const hasAny = tracksInDump.some((t) => permittedTrackIds.has(t.id));
        if (!hasAny) continue;
      }
      allowedDumps.push(dump);
    }

    const publishedDumps = allowedDumps
      .slice()
      .sort(byOrder)
      .map((d) => ({
        ...d,
        tracks: dumpTracksByDumpId[d.id].map(project),
      }));

    return NextResponse.json({ tracks: loose, dumps: publishedDumps });
  } catch (err) {
    console.error('Error fetching tracks:', err);
    return NextResponse.json({ error: 'Failed to load tracks.' }, { status: 500 });
  }
}

/**
 * PUT /api/tracks
 * Admin only: update track metadata
 */
export async function PUT(request) {
  const user = await authenticateRequest(request);
  if (!user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Single track update
    if (body.track) {
      const before = await getDumpsContainingTrack(body.track.id);
      await saveTrack(body.track);
      const after = await getDumpsContainingTrack(body.track.id);
      invalidatePublicMusic({
        trackId: body.track.id,
        dumpHandles: [...before, ...after].flatMap((dump) => [dump.id, dump.slug]),
      });
      return NextResponse.json({ ok: true });
    }

    // Batch update (reordering)
    if (!Array.isArray(body.tracks)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }
    const beforeByTrack = new Map();
    for (const track of body.tracks) {
      beforeByTrack.set(track.id, await getDumpsContainingTrack(track.id));
    }
    await saveTracks(body.tracks);
    for (const track of body.tracks) {
      const after = await getDumpsContainingTrack(track.id);
      invalidatePublicMusic({
        trackId: track.id,
        dumpHandles: [...(beforeByTrack.get(track.id) || []), ...after]
          .flatMap((dump) => [dump.id, dump.slug]),
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Error saving tracks:', err);
    return NextResponse.json({ error: 'Failed to save tracks.' }, { status: 500 });
  }
}
