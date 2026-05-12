import { NextResponse } from 'next/server';
import {
  getInstallerUploadUrl,
  isPortaputerStorageConfigured,
  PORTAPUTER_INSTALLER_KEY,
} from '@/lib/portaputerS3';

export const dynamic = 'force-dynamic';

// Admin endpoint: issue a presigned PUT URL so the browser can upload the
// installer directly to S3 (no streaming through Lambda — Lambda has a 6 MB
// payload limit, and the installer is ~hundreds of MB).
// Gated by NEXT_PUBLIC_ADMIN_PASSWORD via Authorization: Bearer <password>.
export async function POST(request) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const expected = process.env.NEXT_PUBLIC_ADMIN_PASSWORD;
  if (!expected || token !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isPortaputerStorageConfigured()) {
    return NextResponse.json(
      { error: 'PORTAPUTER_S3_BUCKET is not configured on the server.' },
      { status: 503 },
    );
  }

  let contentType = 'application/octet-stream';
  try {
    const body = await request.json();
    if (typeof body?.contentType === 'string' && body.contentType) {
      contentType = body.contentType;
    }
  } catch {}

  try {
    const url = await getInstallerUploadUrl({ contentType });
    return NextResponse.json({
      url,
      key: PORTAPUTER_INSTALLER_KEY,
      method: 'PUT',
      headers: { 'Content-Type': contentType },
    });
  } catch (err) {
    console.error('[portaputer/upload] sign failed:', err?.message || err);
    return NextResponse.json(
      { error: err?.message || 'Failed to issue upload URL' },
      { status: 500 },
    );
  }
}
