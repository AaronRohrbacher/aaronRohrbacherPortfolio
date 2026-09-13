import { NextResponse } from 'next/server';
import {
  getInstallerDownloadUrl,
  PREMIER_INSTALLER_KEY,
} from '@/lib/portaputerS3';
import { logEvent, EVENT_TYPES, requestMeta } from '@/lib/eventLog';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  if (new URL(request.url).searchParams.get('key') !== '66514a35') {
    return new NextResponse('Not Found', {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }

  const { ip, userAgent, city, region, country } = requestMeta(request);
  const h = request.headers;
  const detail = {
    status: 'ok',
    referrer: h.get('referer') || h.get('referrer') || null,
    acceptLanguage: h.get('accept-language') || null,
    country,
    region,
    city,
  };

  try {
    const url = await getInstallerDownloadUrl({
      key: PREMIER_INSTALLER_KEY,
      filename: PREMIER_INSTALLER_KEY,
    });
    await logEvent({
      site: 'portaputer',
      type: EVENT_TYPES.PORTAPUTER_DOWNLOAD,
      targetType: 'installer-archive',
      targetId: PREMIER_INSTALLER_KEY,
      detail,
      ip,
      userAgent,
    });
    return NextResponse.redirect(url, {
      status: 302,
      headers: {
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch (err) {
    console.error('[portaputer/premier-download] sign failed:', err?.message || err);
    await logEvent({
      site: 'portaputer',
      type: EVENT_TYPES.PORTAPUTER_DOWNLOAD,
      targetType: 'installer-archive',
      targetId: PREMIER_INSTALLER_KEY,
      detail: { ...detail, status: 'error', error: err?.message || String(err) },
      ip,
      userAgent,
    });
    return NextResponse.json(
      { error: 'Download is temporarily unavailable.' },
      { status: 500 },
    );
  }
}
