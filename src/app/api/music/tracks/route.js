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

    // Load dumps early so we can cascade publish state
    const dumps = await loadDumps();
    const publishedDumpIds = new Set(dumps.filter((d) => d.published).map((d) => d.id));

    // A track is effectively published if it's published itself OR belongs to a published dump
    function isEffectivelyPublished(t) {
      return t.published || (t.dumpId && publishedDumpIds.has(t.dumpId));
    }

    let tracks;
    if (user?.isAdmin) {
      tracks = merged.filter(isEffectivelyPublished);
    } else if (user) {
      tracks = await getTracksForUser(user.sub, user.groups, publishedDumpIds, user.email);
    } else {
      tracks = merged.filter((t) => isEffectivelyPublished(t) && (t.visibility || 'public') === 'public');
    }
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
        dumpId: track.dumpId,
        addedAt: track.addedAt,
        formats: Object.keys(track.formats),
        streamUrls,
      };
    });

    // Group by dump — only group into published dumps, rest are loose
    const dumpMap = {};
    const loose = [];
    for (const t of withUrls) {
      if (t.dumpId && publishedDumpIds.has(t.dumpId)) {
        if (!dumpMap[t.dumpId]) dumpMap[t.dumpId] = [];
        dumpMap[t.dumpId].push(t);
      } else {
        loose.push(t);
      }
    }

    const publishedDumps = dumps
      .filter((d) => d.published && dumpMap[d.id]?.length > 0)
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
