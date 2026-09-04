import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/verifyToken';
import { getTrack } from '@/lib/trackStore';
import { logEvent, EVENT_TYPES, requestMeta } from '@/lib/eventLog';

const TYPES = {
  start: EVENT_TYPES.PLAYBACK_START,
  pause: EVENT_TYPES.PLAYBACK_PAUSE,
  progress: EVENT_TYPES.PLAYBACK_PROGRESS,
  complete: EVENT_TYPES.PLAYBACK_COMPLETE,
  error: EVENT_TYPES.PLAYBACK_ERROR,
};

export async function POST(request) {
  try {
    const body = await request.json();
    const type = TYPES[body.action];
    if (!type || typeof body.trackId !== 'string' || !body.trackId) {
      return NextResponse.json({ error: 'Invalid playback event' }, { status: 400 });
    }
    const track = await getTrack(body.trackId);
    if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 });
    const user = await authenticateRequest(request);
    const seconds = Number.isFinite(Number(body.seconds)) ? Math.max(0, Math.round(Number(body.seconds))) : 0;
    const duration = Number.isFinite(Number(body.duration)) ? Math.max(0, Math.round(Number(body.duration))) : 0;
    await logEvent({
      type,
      site: 'music',
      actor: user?.email || null,
      targetType: 'track',
      targetId: track.id,
      detail: {
        sessionId: String(body.sessionId || '').slice(0, 100) || null,
        format: String(body.format || '').slice(0, 12) || null,
        seconds,
        duration,
        page: String(body.page || '').slice(0, 300) || null,
        message: String(body.message || '').slice(0, 300) || null,
      },
      ...requestMeta(request),
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Invalid playback event' }, { status: 400 });
  }
}
