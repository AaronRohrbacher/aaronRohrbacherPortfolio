import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const BUCKET = 'musicsforu';
const REGION = 'us-east-2';

let _client;
function getClient() {
  if (!_client) {
    const opts = { region: REGION };
    const accessKey = process.env.AWS_ACCESS_KEY_ID_MUSIC || process.env.AWS_ACCESS_KEY_ID;
    const secretKey = process.env.AWS_SECRET_ACCESS_KEY_MUSIC || process.env.AWS_SECRET_ACCESS_KEY;
    if (accessKey && secretKey) {
      opts.credentials = { accessKeyId: accessKey, secretAccessKey: secretKey };
    }
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
