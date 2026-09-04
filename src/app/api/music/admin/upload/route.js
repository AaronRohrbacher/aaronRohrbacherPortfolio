import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/verifyToken';
import { getUploadUrl } from '@/lib/s3';

const MIME_MAP = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  aiff: 'audio/aiff',
  aif: 'audio/aiff',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

/**
 * POST /api/admin/upload
 * Admin only: generate presigned upload URLs for supported audio/video variants.
 * Body: { files: [{ filename: "track.wav" }, ...] }
 * Returns: { urls: [{ filename, key, uploadUrl }] }
 */
export async function POST(request) {
  const user = await authenticateRequest(request);
  if (!user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { files } = await request.json();
    if (!Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: 'files array required' }, { status: 400 });
    }

    const urls = await Promise.all(
      files.map(async ({ filename }) => {
        const ext = filename.split('.').pop().toLowerCase();
        const contentType = MIME_MAP[ext];
        if (!contentType) {
          return { filename, error: `Unsupported format: ${ext}` };
        }
        // Use the filename as the S3 key directly
        const key = filename;
        const uploadUrl = await getUploadUrl(key, contentType, 3600);
        return { filename, key, uploadUrl };
      })
    );

    return NextResponse.json({ urls });
  } catch (err) {
    console.error('Upload URL error:', err);
    return NextResponse.json({ error: 'Failed to generate upload URLs' }, { status: 500 });
  }
}
