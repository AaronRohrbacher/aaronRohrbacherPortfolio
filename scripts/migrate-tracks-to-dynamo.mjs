#!/usr/bin/env node

/**
 * One-time migration: .data/tracks.json → DynamoDB MusicData table.
 *
 * Usage:
 *   MUSIC_TABLE_NAME=<table-name> node scripts/migrate-tracks-to-dynamo.mjs
 *
 * Uses your ~/.aws/credentials for auth.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

const TABLE_NAME = process.env.MUSIC_TABLE_NAME;
if (!TABLE_NAME) {
  console.error('Set MUSIC_TABLE_NAME env var (e.g. from `sst shell -- env | grep MusicData`)');
  process.exit(1);
}

const REGION = process.env.AWS_REGION || 'us-west-2';

const ddb = new DynamoDBClient({ region: REGION });
const doc = DynamoDBDocumentClient.from(ddb, {
  marshallOptions: { removeUndefinedValues: true },
});

const tracksPath = join(process.cwd(), '.data', 'tracks.json');

let tracks;
try {
  const raw = await readFile(tracksPath, 'utf-8');
  tracks = JSON.parse(raw);
} catch (err) {
  console.error(`Could not read ${tracksPath}:`, err.message);
  process.exit(1);
}

if (!Array.isArray(tracks) || tracks.length === 0) {
  console.log('No tracks to migrate.');
  process.exit(0);
}

console.log(`Migrating ${tracks.length} tracks to DynamoDB table: ${TABLE_NAME}`);

const items = tracks.map((t) => ({
  PutRequest: {
    Item: {
      PK: `TRACK#${t.id}`,
      SK: `TRACK#${t.id}`,
      GSI1PK: 'TRACKS',
      GSI1SK: `ORDER#${String(t.order ?? 0).padStart(6, '0')}`,
      id: t.id,
      name: t.name,
      description: t.description || '',
      artists: t.artists || '',
      published: t.published || false,
      visibility: 'public',
      formats: t.formats || {},
      order: t.order ?? 0,
      dumpId: null,
    },
  },
}));

// Batch write in chunks of 25
for (let i = 0; i < items.length; i += 25) {
  const batch = items.slice(i, i + 25);
  await doc.send(
    new BatchWriteCommand({
      RequestItems: { [TABLE_NAME]: batch },
    })
  );
  console.log(`  Wrote ${Math.min(i + 25, items.length)}/${items.length}`);
}

console.log('Migration complete.');
