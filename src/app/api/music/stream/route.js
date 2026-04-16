import { NextResponse } from 'next/server';
import { getDownloadUrl, getStreamUrl } from '@/lib/s3';
import {
  getTrack,
  canViewTrackDirect,
  canViewTrackInDumps,
  getDumpsContainingTrack,
  getPermittedTrackIds,
  redeemDumpShareLink,
  redeemTrackShareLink,
} from '@/lib/trackStore';
import { authenticateRequest } from '@/lib/verifyToken';
import { logEvent, EVENT_TYPES, requestMeta } from '@/lib/eventLog';

/**
 * GET /api/music/stream?id=trackId&format=mp3&download=1
 * Streaming: redirects to a CDN URL (prod) or a presigned S3 URL (dev).
 * Download: redirects to a presigned S3 URL with Content-Disposition baked in.
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

    // Resolve dump membership from the DUMP-side index, NOT from
    // track.dumpIds. The track-side field can drift; the sibling-row
    // index is authoritative — same source the dump endpoint and the
    // /music listing already use.
    const reqMeta = requestMeta(request);
    const containingDumps = await getDumpsContainingTrack(id);
    const containingDumpIds = containingDumps.map((d) => d.id);

    let shareGrant = false;
    if (shareToken) {
      if (containingDumpIds.length > 0) {
        const redeemed = await redeemDumpShareLink(shareToken, reqMeta);
        if (redeemed && containingDumpIds.includes(redeemed.dumpId)) shareGrant = true;
      }
      if (!shareGrant) {
        const redeemed = await redeemTrackShareLink(shareToken, reqMeta);
        if (redeemed && redeemed.trackId === id) shareGrant = true;
      }
    }

    if (!user?.isAdmin && !shareGrant) {
      const permittedTrackIds = user
        ? await getPermittedTrackIds(user.sub, user.groups, user.email)
        : new Set();

      // DUMP TRUMPS: if the track lives in any dump, only the dump's
      // visibility decides — track-side state is irrelevant. Truly loose
      // tracks fall back to canViewTrackDirect.
      const admitted = containingDumps.length > 0
        ? canViewTrackInDumps(containingDumps, { trackId: id, user, permittedTrackIds })
        : canViewTrackDirect(track, { user, permittedTrackIds });

      if (!admitted) {
        // Probe with a hypothetical permitted signed-in user to decide
        // 401 ("sign in and you'd be allowed") vs 403 ("nobody else gets
        // in").
        const probeUser = { sub: '__probe__', groups: [], email: null };
        const probePerms = new Set([id]);
        const signedInProbe = containingDumps.length > 0
          ? canViewTrackInDumps(containingDumps, { trackId: id, user: probeUser, permittedTrackIds: probePerms })
          : canViewTrackDirect(track, { user: probeUser, permittedTrackIds: probePerms });
        if (!user && signedInProbe) {
          return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
        }
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    const key = track.formats[format];
    if (!key) {
      return NextResponse.json(
        { error: `Format '${format}' not available for this track` },
        { status: 404 }
      );
    }

    await logEvent({
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

    // No CDN (dev + any non-CDN stage): proxy the bytes through Next by
    // fetching the presigned S3 URL server-side and streaming its body back
    // to the client.
    //
    // Why proxy instead of redirecting the client to the presigned URL:
    // test clients (and some real clients behind auth middleware) end up
    // forwarding the incoming `Authorization: Bearer <...>` header across
    // the redirect, and S3 rejects any request that carries both a signed
    // query string and an Authorization header
    // ("Only one auth mechanism allowed"). The proxy keeps the signed URL
    // entirely server-side, so the client only ever sees our origin's
    // response — cleanly decoupled from S3's auth model. Performance is
    // fine because fetch streams the body and Next's response passes it
    // through without buffering.
    const streamUrl = await getStreamUrl(key, format);
    const upstream = await fetch(streamUrl);
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: 'Upstream stream failed.' },
        { status: 502 },
      );
    }
    const contentType =
      upstream.headers.get('content-type') ||
      (format === 'mp3' ? 'audio/mpeg'
        : format === 'aiff' || format === 'aif' ? 'audio/aiff'
          : format === 'wav' ? 'audio/wav'
            : 'application/octet-stream');
    const responseHeaders = {
      'Content-Type': contentType,
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, max-age=3600',
    };
    const contentLength = upstream.headers.get('content-length');
    if (contentLength) responseHeaders['Content-Length'] = contentLength;
    const acceptRanges = upstream.headers.get('accept-ranges');
    if (acceptRanges) responseHeaders['Accept-Ranges'] = acceptRanges;
    return new NextResponse(upstream.body, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error('Stream error:', err);
    return NextResponse.json({ error: 'Failed to stream track.' }, { status: 500 });
  }
}
