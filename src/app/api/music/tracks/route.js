import { NextResponse } from 'next/server';
import { listBucketTracks } from '@/lib/s3';
import {
  saveTrack,
  saveTracks,
  mergeTracks,
  getTracksForUser,
  loadAllTracks,
  loadDumps,
} from '@/lib/trackStore';
import { authenticateRequest } from '@/lib/verifyToken';

/**
 * GET /api/music/tracks
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

    // Load dumps early so we can cascade publish state.
    // Visibility gates which dumps are "visible" to this viewer — a dump
    // that's published but e.g. authenticated-only must not surface to anon
    // viewers, and its tracks must not be grouped under it in the response.
    const dumps = await loadDumps();
    const publishedDumpIds = new Set(
      dumps
        .filter((d) => {
          if (!d.published) return false;
          if (user?.isAdmin) return true;
          const vis = d.visibility || 'public';
          if (vis === 'public') return true;
          // authenticated + restricted require a signed-in user. For
          // restricted, per-track permissions gate the actual track list,
          // and a dump with zero visible tracks drops out below.
          return vis === 'authenticated' || vis === 'restricted' ? !!user : false;
        })
        .map((d) => d.id)
    );

    // A track is effectively published if it's published itself OR belongs
    // to ANY published dump.
    function isEffectivelyPublished(t) {
      return t.published || (t.dumpIds || []).some((id) => publishedDumpIds.has(id));
    }

    let tracks;
    if (user?.isAdmin) {
      tracks = merged.filter(isEffectivelyPublished);
    } else if (user) {
      tracks = await getTracksForUser(user.sub, user.groups, publishedDumpIds, user.email);
    } else {
      tracks = merged.filter((t) => isEffectivelyPublished(t) && (t.visibility || 'public') === 'public');
    }
    // Respect the admin-assigned manual order. `track.order` is a number
    // that's mutated by the admin Tracks tab's up/down buttons.
    tracks = tracks.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const withUrls = tracks.map((track) => {
      const streamUrls = {};
      for (const format of Object.keys(track.formats)) {
        streamUrls[format] = `/api/music/stream?id=${encodeURIComponent(track.id)}&format=${format}`;
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
    });

    // Group by dump — a track can appear in multiple published dumps. If a
    // track belongs to ANY published dump, it's grouped under those dumps
    // (and NOT included in the loose list to avoid duplication).
    const dumpMap = {};
    const loose = [];
    for (const t of withUrls) {
      const publishedDumpsForTrack = (t.dumpIds || []).filter((id) => publishedDumpIds.has(id));
      if (publishedDumpsForTrack.length > 0) {
        for (const dumpId of publishedDumpsForTrack) {
          if (!dumpMap[dumpId]) dumpMap[dumpId] = [];
          dumpMap[dumpId].push(t);
        }
      } else {
        loose.push(t);
      }
    }

    // Respect the admin-assigned manual dump order on the public listing.
    const publishedDumps = dumps
      .filter((d) => d.published && dumpMap[d.id]?.length > 0)
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((d) => ({ ...d, tracks: dumpMap[d.id] }));

    return NextResponse.json({ tracks: loose, dumps: publishedDumps });
  } catch (err) {
    console.error('Error fetching tracks:', err);
    return NextResponse.json({ error: 'Failed to load tracks.' }, { status: 500 });
  }
}

/**
 * PUT /api/music/tracks
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
      await saveTrack(body.track);
      return NextResponse.json({ ok: true });
    }

    // Batch update (reordering)
    if (!Array.isArray(body.tracks)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }
    await saveTracks(body.tracks);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Error saving tracks:', err);
    return NextResponse.json({ error: 'Failed to save tracks.' }, { status: 500 });
  }
}
