import { NextResponse } from 'next/server';
import { getObject, getDownloadUrl } from '@/lib/s3';
import { getTrack, getTrackPermissions, getDump, redeemDumpShareLink, redeemTrackShareLink } from '@/lib/trackStore';
import { authenticateRequest } from '@/lib/verifyToken';
import { logEvent, EVENT_TYPES, requestMeta } from '@/lib/eventLog';

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
  const shareToken = searchParams.get('share');

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

    // A valid share link grants access regardless of publish state /
    // visibility / sign-in. Two kinds of share token are accepted:
    //   - dump-share: token bound to this track's parent dump
    //   - track-share: token bound to this specific track
    let shareGrant = false;
    if (shareToken) {
      if (track.dumpId) {
        const redeemed = await redeemDumpShareLink(shareToken);
        if (redeemed && redeemed.dumpId === track.dumpId) shareGrant = true;
      }
      if (!shareGrant) {
        const redeemed = await redeemTrackShareLink(shareToken);
        if (redeemed && redeemed.trackId === id) shareGrant = true;
      }
    }

    // Check if track is effectively published (directly or via published dump)
    let effectivelyPublished = track.published;
    if (!effectivelyPublished && track.dumpId) {
      const dump = await getDump(track.dumpId);
      if (dump?.published) effectivelyPublished = true;
    }

    // Admins / share-link holders can stream any track regardless of state
    if (!effectivelyPublished && !user?.isAdmin && !shareGrant) {
      return NextResponse.json({ error: 'Track not available' }, { status: 403 });
    }

    if (track.visibility === 'authenticated' && !user && !shareGrant) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    }

    if (track.visibility === 'restricted' && !shareGrant) {
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

    logEvent({
      type: download ? EVENT_TYPES.DOWNLOAD : EVENT_TYPES.STREAM,
      actor: user?.email || (shareGrant ? `share:${shareToken.slice(0, 8)}` : null),
      targetType: 'track',
      targetId: id,
      detail: format,
      ...requestMeta(request),
    });

    // Streaming: redirect to CloudFront CDN (edge-cached).
    // Downloads: redirect to a presigned S3 URL with Content-Disposition
    // baked in, so the file streams directly from S3 and never hits Lambda's
    // 6 MB response body limit.
    const filename = `${track.name}.${format}`;
    if (download) {
      const url = await getDownloadUrl(key, filename);
      // `urlOnly=1` returns the presigned URL as JSON so authenticated
      // clients (admin panel) can navigate to it themselves, avoiding the
      // CORS issue that would hit if a fetch followed the redirect.
      if (searchParams.get('urlOnly') === '1') {
        return NextResponse.json({ url });
      }
      return NextResponse.redirect(url, 302);
    }

    const cdnDomain = process.env.MUSIC_CDN_DOMAIN;
    if (cdnDomain) {
      const cdnUrl = `https://${cdnDomain}/${encodeURI(key)}`;
      return NextResponse.redirect(cdnUrl, 302);
    }

    // Fallback: proxy through server (CDN not configured, dev only)
    const s3Response = await getObject(key);
    return new Response(s3Response.Body, {
      headers: {
        'Content-Type': CONTENT_TYPES[format] || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${filename}"`,
        ...(s3Response.ContentLength && { 'Content-Length': String(s3Response.ContentLength) }),
      },
    });
  } catch (err) {
    console.error('Stream error:', err);
    return NextResponse.json({ error: 'Failed to stream track.' }, { status: 500 });
  }
}
