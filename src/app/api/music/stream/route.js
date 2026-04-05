import { NextResponse } from 'next/server';
import { getObject } from '@/lib/s3';
import { getTrack, getTrackPermissions, getDump } from '@/lib/trackStore';
import { authenticateRequest } from '@/lib/verifyToken';

const CONTENT_TYPES = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  aiff: 'audio/aiff',
};

/**
 * GET /api/music/stream?id=trackId&format=mp3&download=1
 * Streaming: redirects to public S3 URL.
 * Download: proxies the file with Content-Disposition: attachment.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const format = searchParams.get('format') || 'mp3';
  const download = searchParams.get('download') === '1';

  if (!id) {
    return NextResponse.json({ error: 'Missing track id' }, { status: 400 });
  }

  try {
    const track = await getTrack(id);
    if (!track) {
      return NextResponse.json({ error: 'Track not found' }, { status: 404 });
    }

    // Permission check
    const user = await authenticateRequest(request);

    // Check if track is effectively published (directly or via published dump)
    let effectivelyPublished = track.published;
    if (!effectivelyPublished && track.dumpId) {
      const dump = await getDump(track.dumpId);
      if (dump?.published) effectivelyPublished = true;
    }

    // Admins can stream/download any track regardless of publish state
    if (!effectivelyPublished && !user?.isAdmin) {
      return NextResponse.json({ error: 'Track not available' }, { status: 403 });
    }

    if (track.visibility === 'authenticated' && !user) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }

    if (track.visibility === 'restricted') {
      if (!user) {
        return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
      }
      if (!user.isAdmin) {
        const perms = await getTrackPermissions(id);
        const hasUserPerm = perms.users.some((p) => p.userId === user.sub || p.userId === user.email);
        const userGroupsLower = user.groups.map((g) => g.toLowerCase());
        const hasGroupPerm = perms.groups.some((p) => userGroupsLower.includes(p.groupName.toLowerCase()));
        if (!hasUserPerm && !hasGroupPerm) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }
      }
    }

    const key = track.formats[format];
    if (!key) {
      return NextResponse.json(
        { error: `Format '${format}' not available for this track` },
        { status: 404 }
      );
    }

    // Proxy through server — works with both public and private buckets
    const s3Response = await getObject(key);
    const filename = `${track.name}.${format}`;
    const disposition = download
      ? `attachment; filename="${filename}"`
      : `inline; filename="${filename}"`;

    return new Response(s3Response.Body, {
      headers: {
        'Content-Type': CONTENT_TYPES[format] || 'application/octet-stream',
        'Content-Disposition': disposition,
        ...(s3Response.ContentLength && { 'Content-Length': String(s3Response.ContentLength) }),
      },
    });
  } catch (err) {
    console.error('Stream error:', err);
    return NextResponse.json({ error: 'Failed to stream track.' }, { status: 500 });
  }
}
