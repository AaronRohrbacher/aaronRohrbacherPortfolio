import { NextResponse } from 'next/server';
import {
  getInstallerUploadUrl,
  isPortaputerStorageConfigured,
  PORTAPUTER_INSTALLER_KEY,
} from '@/lib/portaputerS3';
import { authenticateRequest } from '@/lib/verifyToken';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const user = await authenticateRequest(request);
  if (!user?.isAdmin) {
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
