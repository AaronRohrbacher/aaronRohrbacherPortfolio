import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const BUCKET = 'musicsforu';
const REGION = 'us-east-2';

let _client;
function getClient() {
  if (!_client) {
    const opts = { region: REGION };
    const accessKey = process.env.AWS_ACCESS_KEY_ID_MUSIC;
    const secretKey = process.env.AWS_SECRET_ACCESS_KEY_MUSIC;
    if (accessKey && secretKey) {
      opts.credentials = { accessKeyId: accessKey, secretAccessKey: secretKey };
    }
    // Otherwise: SDK default credential chain (Lambda IAM role w/ session token)
    _client = new S3Client(opts);
  }
  return _client;
}

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.aiff', '.aif'];

/**
 * List all audio files in the S3 bucket, grouped by track name.
 * Returns: { [trackName]: { mp3?: key, wav?: key, aiff?: key } }
 */
export async function listBucketTracks() {
  const client = getClient();
  const tracks = {};
  let continuationToken;

  do {
    const cmd = new ListObjectsV2Command({
      Bucket: BUCKET,
      ContinuationToken: continuationToken,
    });
    const response = await client.send(cmd);

    for (const obj of response.Contents || []) {
      const key = obj.Key;
      const lower = key.toLowerCase();

      const ext = AUDIO_EXTENSIONS.find((e) => lower.endsWith(e));
      if (!ext) continue;

      const filename = key.split('/').pop();
      const trackName = filename.replace(/\.(mp3|wav|aiff|aif)$/i, '');

      if (!tracks[trackName]) {
        tracks[trackName] = { _formats: {}, _addedAt: null };
      }

      const format = ext === '.aif' ? 'aiff' : ext.slice(1);
      tracks[trackName]._formats[format] = key;

      // Use earliest LastModified as the addedAt date
      const modified = obj.LastModified?.toISOString() || null;
      if (modified && (!tracks[trackName]._addedAt || modified < tracks[trackName]._addedAt)) {
        tracks[trackName]._addedAt = modified;
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  // Flatten to { [trackName]: { formats, addedAt } }
  const result = {};
  for (const [name, data] of Object.entries(tracks)) {
    result[name] = { formats: data._formats, addedAt: data._addedAt };
  }
  return result;
}

/**
 * Get an S3 object as a readable stream (for proxied downloads).
 */
export async function getObject(key) {
  const client = getClient();
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return client.send(command);
}

const DOWNLOAD_CONTENT_TYPES = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  aiff: 'audio/aiff',
  aif: 'audio/aiff',
};

/**
 * Get a presigned URL for downloading an S3 object, with Content-Disposition
 * and Content-Type overridden in the response so the browser saves it with a
 * friendly name and a canonical mime type regardless of how the object was
 * uploaded.
 */
export async function getDownloadUrl(key, filename, expiresIn = 3600) {
  const client = getClient();
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const contentType = DOWNLOAD_CONTENT_TYPES[ext] || 'application/octet-stream';
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${filename.replace(/"/g, '')}"`,
    ResponseContentType: contentType,
  });
  return getSignedUrl(client, command, { expiresIn });
}

/**
 * Get a presigned URL for inline streaming (no Content-Disposition so the
 * browser plays it instead of saving, canonical audio/* content-type). Used
 * by the /api/music/stream route as the no-CDN fallback — redirect the
 * client straight to S3 rather than proxying the body through Lambda /
 * Next dev server.
 */
export async function getStreamUrl(key, format, expiresIn = 3600) {
  const client = getClient();
  const contentType = DOWNLOAD_CONTENT_TYPES[format] || 'application/octet-stream';
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ResponseContentType: contentType,
  });
  return getSignedUrl(client, command, { expiresIn });
}

/**
 * Get a presigned URL for uploading a file to S3.
 */
export async function getUploadUrl(key, contentType, expiresIn = 3600) {
  const client = getClient();
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(client, command, { expiresIn });
}
