import { NextResponse } from 'next/server';
import {
  getInstallerDownloadUrl,
  isPortaputerStorageConfigured,
  PORTAPUTER_INSTALLER_KEY,
} from '@/lib/portaputerS3';
import { logEvent, EVENT_TYPES, requestMeta } from '@/lib/eventLog';

export const dynamic = 'force-dynamic';

// GET /api/download
// Logs the download attempt then 302-redirects to a presigned S3 URL.
// The .exe never leaves S3 — Lambda just signs a URL and steps out of the way.
export async function GET(request) {
  const { ip, userAgent, city, region, country } = requestMeta(request);
  const h = request.headers;
  const referrer = h.get('referer') || h.get('referrer') || null;
  const acceptLanguage = h.get('accept-language') || null;

  if (!isPortaputerStorageConfigured()) {
    // Still log the click — useful telemetry while the bucket is being set up.
    await logEvent({
      site: 'portaputer',
      type: EVENT_TYPES.PORTAPUTER_DOWNLOAD,
      targetType: 'installer',
      targetId: PORTAPUTER_INSTALLER_KEY,
      detail: {
        status: 'unconfigured',
        referrer,
        acceptLanguage,
        country,
        region,
        city,
      },
      ip,
      userAgent,
    });
    return NextResponse.json(
      {
        error:
          'PortaPuter installer is not available yet. Check back shortly.',
      },
      { status: 503 },
    );
  }

  try {
    const url = await getInstallerDownloadUrl();
    await logEvent({
      site: 'portaputer',
      type: EVENT_TYPES.PORTAPUTER_DOWNLOAD,
      targetType: 'installer',
      targetId: PORTAPUTER_INSTALLER_KEY,
      detail: {
        status: 'ok',
        referrer,
        acceptLanguage,
        country,
        region,
        city,
      },
      ip,
      userAgent,
    });
    return NextResponse.redirect(url, { status: 302 });
  } catch (err) {
    console.error('[portaputer/download] sign failed:', err?.message || err);
    await logEvent({
      site: 'portaputer',
      type: EVENT_TYPES.PORTAPUTER_DOWNLOAD,
      targetType: 'installer',
      targetId: PORTAPUTER_INSTALLER_KEY,
      detail: {
        status: 'error',
        error: err?.message || String(err),
        referrer,
        acceptLanguage,
        country,
        region,
        city,
      },
      ip,
      userAgent,
    });
    return NextResponse.json(
      { error: 'Download is temporarily unavailable.' },
      { status: 500 },
    );
  }
}
