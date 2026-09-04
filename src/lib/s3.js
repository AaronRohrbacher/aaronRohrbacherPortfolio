import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const BUCKET = 'aarons-recordings';
const REGION = 'us-west-2';

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

// Uploaded variants are grouped by shared basename. Nothing is transcoded:
// only objects that actually exist in the bucket become playback/download
// options.
const MEDIA_EXTENSIONS = ['.mp3', '.wav', '.aac', '.m4a', '.aiff', '.aif', '.mp4', '.m4v', '.webm', '.mov'];

/**
 * List uploaded media in the S3 bucket, grouped by shared basename.
 * Returns: { [trackName]: { formats: { mp3?: key, mp4?: key, ... }, addedAt } }
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

      const ext = MEDIA_EXTENSIONS.find((e) => lower.endsWith(e));
      if (!ext) continue;

      const filename = key.split('/').pop();
      const trackName = filename.replace(/\.(mp3|wav|aac|m4a|aiff|aif|mp4|m4v|webm|mov)$/i, '');

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
    ResponseContentDisposition: `attachment; filename="${filename.replace(/[\r\n"]/g, '')}"`,
    ResponseContentType: contentType,
  });
  return getSignedUrl(client, command, { expiresIn });
}

/**
 * Get a presigned URL for inline streaming. Explicit `Content-Disposition:
 * inline` so the browser plays the file instead of saving it, plus the
 * canonical audio/* content-type. Used by /api/stream as the no-CDN
 * fallback — redirect the client straight to S3 rather than proxying the
 * body through Lambda / Next dev server.
 */
export async function getStreamUrl(key, format, expiresIn = 3600) {
  const client = getClient();
  const contentType = DOWNLOAD_CONTENT_TYPES[format] || 'application/octet-stream';
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ResponseContentType: contentType,
    ResponseContentDisposition: 'inline',
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
