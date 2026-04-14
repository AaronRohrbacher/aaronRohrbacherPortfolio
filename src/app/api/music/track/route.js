import { NextResponse } from 'next/server';
import {
  getTrack,
  canViewTrackDirect,
  canViewTrackInDumps,
  getDumpsContainingTrack,
  getPermittedTrackIds,
  redeemTrackShareLink,
  redeemDumpShareLink,
} from '@/lib/trackStore';
import { authenticateRequest } from '@/lib/verifyToken';
import { logEvent, EVENT_TYPES, requestMeta } from '@/lib/eventLog';

/**
 * GET /api/music/track?id=xxx[&share=<token>]
 * Public endpoint for viewing a single track + its stream URLs
 * (with permission checks).
 *
 * A valid track-share token bound to this track id bypasses publish/visibility
 * checks. A dump-share token bound to ANY of this track's parent dumps also
 * works, matching the existing dump-share behavior on the stream endpoint.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const shareToken = searchParams.get('share');
  if (!id) {
    return NextResponse.json({ error: 'Missing track id' }, { status: 400 });
  }

  try {
    const track = await getTrack(id);
    if (!track) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const user = await authenticateRequest(request);
    const meta = requestMeta(request);

    // Dump-side authority — same approach as the stream endpoint and the
    // /music listing. Don't trust track.dumpIds for the visibility gate;
    // walk the DUMP-side index instead.
    const containingDumps = await getDumpsContainingTrack(id);
    const containingDumpIds = containingDumps.map((d) => d.id);

    let shareGrant = false;
    if (shareToken) {
      const trackRedeemed = await redeemTrackShareLink(shareToken, meta);
      if (trackRedeemed && trackRedeemed.trackId === id) {
        shareGrant = true;
        await logEvent({
          type: EVENT_TYPES.SHARE_REDEEM,
          targetType: 'track',
          targetId: id,
          detail: `token:${shareToken.slice(0, 8)}`,
          ...meta,
        });
      }
      if (!shareGrant && containingDumpIds.length > 0) {
        const dumpRedeemed = await redeemDumpShareLink(shareToken, meta);
        if (dumpRedeemed && containingDumpIds.includes(dumpRedeemed.dumpId)) {
          shareGrant = true;
          await logEvent({
            type: EVENT_TYPES.SHARE_REDEEM,
            targetType: 'dump',
            targetId: dumpRedeemed.dumpId,
            detail: `token:${shareToken.slice(0, 8)}`,
            ...meta,
          });
        }
      }
    }

    if (!user?.isAdmin && !shareGrant) {
      const permittedTrackIds = user
        ? await getPermittedTrackIds(user.sub, user.groups, user.email)
        : new Set();

      // DUMP TRUMPS: if the track lives in any dump, only the dump's
      // visibility decides. Truly loose tracks fall back to canViewTrackDirect.
      const admitted = containingDumps.length > 0
        ? canViewTrackInDumps(containingDumps, { trackId: id, user, permittedTrackIds })
        : canViewTrackDirect(track, { user, permittedTrackIds });

      if (!admitted) {
        const probeUser = { sub: '__probe__', groups: [], email: null };
        const probePerms = new Set([id]);
        const signedInProbe = containingDumps.length > 0
          ? canViewTrackInDumps(containingDumps, { trackId: id, user: probeUser, permittedTrackIds: probePerms })
          : canViewTrackDirect(track, { user: probeUser, permittedTrackIds: probePerms });
        if (!user && signedInProbe) {
          return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
        }
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
    }

    // Propagate share token to stream URLs so playback + download work for
    // link-only visitors.
    const shareQs = shareGrant ? `&share=${encodeURIComponent(shareToken)}` : '';
    const streamUrls = Object.fromEntries(
      Object.keys(track.formats || {}).map((f) => [
        f,
        `/api/music/stream?id=${encodeURIComponent(track.id)}&format=${f}${shareQs}`,
      ])
    );

    return NextResponse.json({
      track: {
        id: track.id,
        name: track.name,
        description: track.description,
        artists: track.artists,
        dumpIds: containingDumpIds,
        addedAt: track.addedAt,
        formats: Object.keys(track.formats || {}),
        streamUrls,
      },
    });
  } catch (err) {
    console.error('Track fetch error:', err);
    return NextResponse.json({ error: 'Failed to load track' }, { status: 500 });
  }
}
