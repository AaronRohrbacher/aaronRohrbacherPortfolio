#!/usr/bin/env node
/**
 * One-off: copy the "tune-dump" dump row + its tracks from the live
 * production DynamoDB table into the local DynamoDB-Local instance,
 * mark the dump public, and mint a share link so it can be reached
 * without auth. Prints the share URL at the end.
 *
 * Usage: node scripts/import-prod-dump.mjs
 */

import { DynamoDBClient, ScanCommand as LLScanCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, GetCommand, ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomBytes } from 'crypto';

const PROD_REGION = 'us-west-2';
const PROD_TABLE = 'aaron-portfolio-production-MusicDataTable-ucdhnemh';
const LOCAL_ENDPOINT = 'http://localhost:8123';
const LOCAL_TABLE = 'MusicData';
const DUMP_ID = 'dump-1775881760791';

function doc(client) {
  return DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });
}

const prodRaw = new DynamoDBClient({ region: PROD_REGION });
const prod = doc(prodRaw);

const localRaw = new DynamoDBClient({
  region: 'us-west-2',
  endpoint: LOCAL_ENDPOINT,
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});
const local = doc(localRaw);

async function queryAll(client, table, params) {
  const items = [];
  let lastKey;
  do {
    const { Items, LastEvaluatedKey } = await client.send(
      new QueryCommand({ TableName: table, ...params, ExclusiveStartKey: lastKey })
    );
    items.push(...(Items || []));
    lastKey = LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function scanAll(client, table, params) {
  const items = [];
  let lastKey;
  do {
    const { Items, LastEvaluatedKey } = await client.send(
      new ScanCommand({ TableName: table, ...params, ExclusiveStartKey: lastKey })
    );
    items.push(...(Items || []));
    lastKey = LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function putRow(client, table, item) {
  await client.send(new PutCommand({ TableName: table, Item: item }));
}

async function main() {
  console.log(`→ reading dump ${DUMP_ID} from prod…`);
  const dumpRow = (await prod.send(new GetCommand({
    TableName: PROD_TABLE,
    Key: { PK: `DUMP#${DUMP_ID}`, SK: `DUMP#${DUMP_ID}` },
  }))).Item;
  if (!dumpRow) throw new Error(`Dump ${DUMP_ID} not found in prod`);
  console.log(`  dump: "${dumpRow.name}" (visibility=${dumpRow.visibility})`);

  // Track membership sibling rows for this dump.
  const trackDumpRows = await queryAll(prod, PROD_TABLE, {
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk',
    ExpressionAttributeValues: { ':pk': `DUMP#${DUMP_ID}` },
  });
  console.log(`  ${trackDumpRows.length} track membership rows`);

  // For each track, pull its main TRACK#<id> row.
  const trackIds = [...new Set(trackDumpRows.map((r) => r.trackId).filter(Boolean))];
  const trackRows = [];
  for (const id of trackIds) {
    const r = (await prod.send(new GetCommand({
      TableName: PROD_TABLE,
      Key: { PK: `TRACK#${id}`, SK: `TRACK#${id}` },
    }))).Item;
    if (r) trackRows.push(r);
  }
  console.log(`  ${trackRows.length} track rows`);

  // Keep dump visibility restricted — access is granted via the share
  // link minted below, matching the production access model.
  const localDump = { ...dumpRow, visibility: 'restricted' };

  console.log('→ writing to local dynamo…');
  await putRow(local, LOCAL_TABLE, localDump);
  for (const row of trackDumpRows) await putRow(local, LOCAL_TABLE, row);
  for (const row of trackRows) await putRow(local, LOCAL_TABLE, row);
  console.log(`  wrote 1 dump + ${trackDumpRows.length} memberships + ${trackRows.length} tracks`);

  // Mint a dump share link locally.
  console.log('→ creating dump share link…');
  const token = randomBytes(32).toString('hex');
  const createdAt = new Date().toISOString();
  const linkItem = {
    PK: `DUMP_SHARE#${token}`,
    SK: `DUMP_SHARE#${token}`,
    GSI1PK: `DUMP_LINK#${DUMP_ID}`,
    GSI1SK: `DUMP_SHARE#${token}`,
    token,
    dumpId: DUMP_ID,
    label: 'local test link',
    active: true,
    createdBy: 'import-script',
    createdAt,
    expiresAt: null,
  };
  await putRow(local, LOCAL_TABLE, linkItem);

  const slug = dumpRow.slug || DUMP_ID;
  const localUrl = `http://music.localhost:3000/dump/${slug}?share=${token}`;
  const lanIp = process.env.DEV_LAN_IP || '10.1.1.236';
  const lanUrl = `http://music.${lanIp}.nip.io:3000/dump/${slug}?share=${token}`;

  console.log('\n✔ done');
  console.log('');
  console.log('  Local:   ' + localUrl);
  console.log('  LAN:     ' + lanUrl);
  console.log('');
  console.log(`  token:   ${token}`);
  console.log(`  dumpId:  ${DUMP_ID}`);
}

main().catch((err) => {
  console.error('\n✘ import failed:', err);
  process.exit(1);
});
