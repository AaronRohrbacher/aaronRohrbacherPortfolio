import { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Configurable so the bucket/key can be filled in once the .exe is uploaded.
// Falls back to placeholders that the download route surfaces as a clear error
// rather than a hard crash.
export const PORTAPUTER_BUCKET = process.env.PORTAPUTER_S3_BUCKET || '';
export const PORTAPUTER_REGION = process.env.PORTAPUTER_S3_REGION || 'us-west-2';
export const PORTAPUTER_INSTALLER_KEY =
  process.env.PORTAPUTER_INSTALLER_KEY || 'PortaPuterCapture-Setup.exe';

let _client;
function getClient() {
  if (!_client) {
    const opts = { region: PORTAPUTER_REGION };
    const accessKey = process.env.AWS_ACCESS_KEY_ID_PORTAPUTER;
    const secretKey = process.env.AWS_SECRET_ACCESS_KEY_PORTAPUTER;
    if (accessKey && secretKey) {
      opts.credentials = { accessKeyId: accessKey, secretAccessKey: secretKey };
    }
    _client = new S3Client(opts);
  }
  return _client;
}

export function isPortaputerStorageConfigured() {
  return Boolean(PORTAPUTER_BUCKET);
}

export async function getInstallerDownloadUrl({
  key = PORTAPUTER_INSTALLER_KEY,
  filename = 'PortaPuterCapture-Setup.exe',
  expiresIn = 3600,
} = {}) {
  if (!PORTAPUTER_BUCKET) {
    throw new Error('PORTAPUTER_S3_BUCKET is not configured');
  }
  const cmd = new GetObjectCommand({
    Bucket: PORTAPUTER_BUCKET,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${filename.replace(/"/g, '')}"`,
    ResponseContentType: 'application/octet-stream',
  });
  return getSignedUrl(getClient(), cmd, { expiresIn });
}

export async function getInstallerUploadUrl({
  key = PORTAPUTER_INSTALLER_KEY,
  contentType = 'application/octet-stream',
  expiresIn = 3600,
} = {}) {
  if (!PORTAPUTER_BUCKET) {
    throw new Error('PORTAPUTER_S3_BUCKET is not configured');
  }
  const cmd = new PutObjectCommand({
    Bucket: PORTAPUTER_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(getClient(), cmd, { expiresIn });
}

export async function headInstaller(key = PORTAPUTER_INSTALLER_KEY) {
  if (!PORTAPUTER_BUCKET) return null;
  try {
    const res = await getClient().send(
      new HeadObjectCommand({ Bucket: PORTAPUTER_BUCKET, Key: key }),
    );
    return {
      size: res.ContentLength ?? null,
      lastModified: res.LastModified?.toISOString() ?? null,
      etag: res.ETag || null,
    };
  } catch {
    return null;
  }
}
