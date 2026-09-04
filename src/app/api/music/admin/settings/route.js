import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/verifyToken';
import { getSetting, setSetting } from '@/lib/trackStore';
import { invalidatePublicMusic } from '@/lib/musicCache';

export async function GET(request) {
  try {
    const tracksPerPage = (await getSetting('tracksPerPage')) ?? 10;
    return NextResponse.json({ tracksPerPage });
  } catch (err) {
    console.error('Get settings error:', err);
    return NextResponse.json({ tracksPerPage: 10 });
  }
}

export async function PUT(request) {
  const user = await authenticateRequest(request);
  if (!user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (body.tracksPerPage != null) {
      await setSetting('tracksPerPage', Number(body.tracksPerPage));
      invalidatePublicMusic();
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Save settings error:', err);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
