import { NextResponse } from 'next/server';
import {
  getTrack,
  getTrackPermissions,
  getDump,
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
 * checks. A dump-share token bound to this track's parent dump also works,
 * matching the existing dump-share behavior on the stream endpoint.
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

    let shareGrant = false;
    if (shareToken) {
      const trackRedeemed = await redeemTrackShareLink(shareToken);
      if (trackRedeemed && trackRedeemed.trackId === id) {
        shareGrant = true;
        logEvent({
          type: EVENT_TYPES.SHARE_REDEEM,
          targetType: 'track',
          targetId: id,
          detail: `token:${shareToken.slice(0, 8)}`,
          ...requestMeta(request),
        });
      }
      if (!shareGrant && track.dumpId) {
        const dumpRedeemed = await redeemDumpShareLink(shareToken);
        if (dumpRedeemed && dumpRedeemed.dumpId === track.dumpId) {
          shareGrant = true;
          logEvent({
            type: EVENT_TYPES.SHARE_REDEEM,
            targetType: 'dump',
            targetId: track.dumpId,
            detail: `token:${shareToken.slice(0, 8)}`,
            ...requestMeta(request),
          });
        }
      }
    }

    // Effectively published = directly published OR parent dump is published
    let effectivelyPublished = track.published;
    if (!effectivelyPublished && track.dumpId) {
      const dump = await getDump(track.dumpId);
      if (dump?.published) effectivelyPublished = true;
    }

    if (!user?.isAdmin && !shareGrant) {
      if (!effectivelyPublished) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }

      const vis = track.visibility || 'public';

      if (vis === 'authenticated' && !user) {
        return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
      }

      if (vis === 'restricted') {
        if (!user) {
          return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
        }
        const perms = await getTrackPermissions(id);
        const hasUserPerm = perms.users.some((p) => p.userId === user.sub || p.userId === user.email);
        const userGroupsLower = user.groups.map((g) => g.toLowerCase());
        const hasGroupPerm = perms.groups.some((p) => userGroupsLower.includes(p.groupName.toLowerCase()));
        if (!hasUserPerm && !hasGroupPerm) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }
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
        dumpId: track.dumpId,
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
