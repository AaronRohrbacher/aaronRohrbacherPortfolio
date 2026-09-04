// Shared helper: reset the dev DB to the same baseline the playwright
// globalSetup creates. Called from `test.beforeAll` of spec files that
// run after music.spec.mjs / share-links / multi-dump (which mutate state
// without restoring) so they always see a clean state.
//
// Baseline: all tracks unpublished+public with empty dumpIds, all test
// dumps deleted, tune-dump public+published with its 5 sibling tracks
// re-imported from prod, first 3 tracks published+public.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { spawnSync } from 'node:child_process';

const TABLE = 'MusicData';
const KEEP_DUMP_ID = 'dump-1775881760791';

const raw = new DynamoDBClient({
  region: 'us-west-2',
  endpoint: 'http://localhost:8123',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});
const doc = DynamoDBDocumentClient.from(raw, { marshallOptions: { removeUndefinedValues: true } });

async function scanAll() {
  const items = [];
  let lastKey;
  do {
    const r = await doc.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey: lastKey }));
    items.push(...(r.Items || []));
    lastKey = r.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

export async function resetMusicDb() {
  let all;
  try {
    all = await scanAll();
  } catch {
    return;
  }

  const trackMain = all.filter((r) => r.PK?.startsWith('TRACK#') && r.SK === r.PK);
  for (const t of trackMain) {
    await doc.send(new UpdateCommand({
      TableName: TABLE,
      Key: { PK: t.PK, SK: t.SK },
      UpdateExpression: 'SET published = :f, visibility = :pub, dumpIds = :empty',
      ExpressionAttributeValues: { ':f': false, ':pub': 'public', ':empty': [] },
    }));
  }

  const trackDumpRows = all.filter((r) => r.PK?.startsWith('TRACK_DUMP#'));
  for (const r of trackDumpRows) {
    await doc.send(new DeleteCommand({ TableName: TABLE, Key: { PK: r.PK, SK: r.SK } }));
  }

  const eventRows = all.filter((r) =>
    r.PK === 'EVENT' || r.PK === 'EVENT#music' || r.PK === 'EVENT#portaputer'
  );
  for (const event of eventRows) {
    await doc.send(new DeleteCommand({ TableName: TABLE, Key: { PK: event.PK, SK: event.SK } }));
  }

  const dumpMain = all.filter((r) => r.PK?.startsWith('DUMP#') && r.SK === r.PK);
  for (const d of dumpMain) {
    const id = d.PK.replace(/^DUMP#/, '');
    if (id === KEEP_DUMP_ID) continue;
    await doc.send(new DeleteCommand({ TableName: TABLE, Key: { PK: d.PK, SK: d.SK } }));
    const partRows = await doc.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': `DUMP#${id}` },
    }));
    for (const item of partRows.Items || []) {
      await doc.send(new DeleteCommand({ TableName: TABLE, Key: { PK: item.PK, SK: item.SK } }));
    }
  }

  try {
    spawnSync('node', ['scripts/import-prod-dump.mjs'], { stdio: 'ignore' });
  } catch { /* prod creds may be unavailable in CI — fine */ }

  try {
    await doc.send(new UpdateCommand({
      TableName: TABLE,
      Key: { PK: `DUMP#${KEEP_DUMP_ID}`, SK: `DUMP#${KEEP_DUMP_ID}` },
      UpdateExpression: 'SET visibility = :pub, published = :t',
      ExpressionAttributeValues: { ':pub': 'public', ':t': true },
    }));
  } catch { /* ignore */ }

  const looseToPublish = trackMain.slice(0, 3);
  for (const t of looseToPublish) {
    await doc.send(new UpdateCommand({
      TableName: TABLE,
      Key: { PK: t.PK, SK: t.SK },
      UpdateExpression: 'SET published = :t, visibility = :pub',
      ExpressionAttributeValues: { ':t': true, ':pub': 'public' },
    }));
  }
}
