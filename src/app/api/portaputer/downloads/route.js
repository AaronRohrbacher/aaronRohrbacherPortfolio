import { NextResponse } from 'next/server';
import { listEvents, EVENT_TYPES } from '@/lib/eventLog';
import { headInstaller, isPortaputerStorageConfigured } from '@/lib/portaputerS3';
import { authenticateRequest } from '@/lib/verifyToken';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const user = await authenticateRequest(request);
  if (!user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get('limit')) || 500, 2000);

  const events = await listEvents({ type: EVENT_TYPES.PORTAPUTER_DOWNLOAD, limit });

  // Derive a few summary stats so the admin UI can render counts without
  // re-grouping in the browser.
  const uniqueIps = new Set();
  const uniqueCountries = new Set();
  let okCount = 0;
  let errorCount = 0;
  for (const ev of events) {
    if (ev.ip) uniqueIps.add(ev.ip);
    const country = ev.detail?.country;
    if (country) uniqueCountries.add(country);
    if (ev.detail?.status === 'ok') okCount += 1;
    else if (ev.detail?.status === 'error' || ev.detail?.status === 'unconfigured') errorCount += 1;
  }

  const installer = isPortaputerStorageConfigured() ? await headInstaller() : null;

  return NextResponse.json({
    events,
    stats: {
      total: events.length,
      ok: okCount,
      failed: errorCount,
      uniqueIps: uniqueIps.size,
      uniqueCountries: uniqueCountries.size,
    },
    installer: {
      configured: isPortaputerStorageConfigured(),
      meta: installer,
    },
  });
}
