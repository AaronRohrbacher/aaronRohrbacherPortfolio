#!/usr/bin/env node

/**
 * Local dev environment:
 *   1. Starts DynamoDB Local (if not already running)
 *   2. Creates the MusicData table (if not present)
 *   3. Seeds an admin user in DynamoDB (if not present)
 *   4. Launches Next.js dev server
 *
 * Usage: npm run dev
 * Requires Java (install via SDKMAN: sdk install java)
 */

import { spawn } from 'child_process';
import { createRequire } from 'module';
import { readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import net from 'net';
import zlib from 'zlib';

// Silence Node's DEP0184 warning: dynamodb-local's index.js calls
// `zlib.Unzip()` without `new` during extraction. Wrap the constructor so
// callers get a properly-constructed instance either way. Must run BEFORE
// requiring dynamodb-local.
const OriginalUnzip = zlib.Unzip;
function UnzipShim(...args) {
    return new.target ? Reflect.construct(OriginalUnzip, args, new.target) : new OriginalUnzip(...args);
}
UnzipShim.prototype = OriginalUnzip.prototype;
zlib.Unzip = UnzipShim;

const require = createRequire(import.meta.url);
const dynamoLocal = require('dynamodb-local');

const DYNAMO_PORT = 8123;
const TABLE_NAME = 'MusicData';
const DATA_DIR = join(process.cwd(), '.data');
const ENDPOINT = `http://localhost:${DYNAMO_PORT}`;

let weStartedDynamo = false;

// ─── Helpers ────────────────────────────────────────────────────────────────

function isPortOpen(port) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(500);
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error', () => { sock.destroy(); resolve(false); });
    sock.once('timeout', () => { sock.destroy(); resolve(false); });
    sock.connect(port, '127.0.0.1');
  });
}

function getDynamoClient() {
  return new DynamoDBClient({
    region: 'us-east-2',
    endpoint: ENDPOINT,
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  });
}

// ─── 1. DynamoDB Local ──────────────────────────────────────────────────────

if (await isPortOpen(DYNAMO_PORT)) {
  console.log(`DynamoDB Local already running on port ${DYNAMO_PORT}.`);
} else {
  console.log('Starting DynamoDB Local...');
  try {
    const dbPath = join(DATA_DIR, 'dynamodb');
    await mkdir(dbPath, { recursive: true });
    await dynamoLocal.launch(DYNAMO_PORT, dbPath, [], false, true);
    weStartedDynamo = true;
    // Wait for it to be reachable
    for (let i = 0; i < 10; i++) {
      if (await isPortOpen(DYNAMO_PORT)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!(await isPortOpen(DYNAMO_PORT))) {
      console.error('DynamoDB Local failed to start. Is Java installed?');
      console.error('  source ~/.sdkman/bin/sdkman-init.sh && java -version');
      process.exit(1);
    }
    console.log(`DynamoDB Local started on port ${DYNAMO_PORT}.`);
  } catch (err) {
    console.error('Failed to start DynamoDB Local:', err.message);
    process.exit(1);
  }
}

// ─── 2. Create table if needed ──────────────────────────────────────────────

const client = getDynamoClient();
try {
  await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
  console.log(`Table "${TABLE_NAME}" exists.`);
} catch {
  console.log(`Creating table "${TABLE_NAME}"...`);
  await client.send(new CreateTableCommand({
    TableName: TABLE_NAME,
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' },
      { AttributeName: 'GSI1PK', AttributeType: 'S' },
      { AttributeName: 'GSI1SK', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexes: [{
      IndexName: 'GSI1',
      KeySchema: [
        { AttributeName: 'GSI1PK', KeyType: 'HASH' },
        { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
      ],
      Projection: { ProjectionType: 'ALL' },
      ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
    }],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
  }));
  console.log('Table created.');
}

// ─── 3. Seed admin user + admin group in DynamoDB if needed ────────────────

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

// Seed admin user
const adminCheck = await docClient.send(new GetCommand({
  TableName: TABLE_NAME,
  Key: { PK: 'USER#admin@local.dev', SK: 'USER#admin@local.dev' },
}));

if (!adminCheck.Item) {
  const bcrypt = await import('bcryptjs');
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: 'USER#admin@local.dev',
      SK: 'USER#admin@local.dev',
      GSI1PK: 'USERS',
      GSI1SK: 'USER#admin@local.dev',
      sub: 'local-admin',
      email: 'admin@local.dev',
      passwordHash: await bcrypt.default.hash('admin', 10),
      groups: ['admin'],
      status: 'CONFIRMED',
      enabled: true,
      createdAt: new Date().toISOString(),
    },
  }));
  console.log('Admin user seeded: admin@local.dev / admin');
} else {
  console.log('Admin user exists.');
}

// Seed admin group
const groupCheck = await docClient.send(new GetCommand({
  TableName: TABLE_NAME,
  Key: { PK: 'AUTH_GROUP#admin', SK: 'AUTH_GROUP#admin' },
}));

if (!groupCheck.Item) {
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: 'AUTH_GROUP#admin',
      SK: 'AUTH_GROUP#admin',
      GSI1PK: 'AUTH_GROUPS',
      GSI1SK: 'GROUP#admin',
      name: 'admin',
      description: 'Music section administrators',
      createdAt: new Date().toISOString(),
    },
  }));
  console.log('Admin group seeded.');
}

// ─── 4. Launch Next.js ──────────────────────────────────────────────────────

// Load .env.local
let envLocal = {};
try {
  for (const line of (await readFile(join(process.cwd(), '.env.local'), 'utf-8')).split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq > 0) envLocal[t.slice(0, eq)] = t.slice(eq + 1);
  }
} catch {}

console.log('\nStarting Next.js...\n');
const next = spawn('npx', ['next', 'dev'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ...envLocal,
    MUSIC_TABLE_NAME: TABLE_NAME,
    DYNAMO_ENDPOINT: ENDPOINT,
    NEXT_PUBLIC_AWS_REGION: 'us-east-2',
  },
});

function cleanup() {
  console.log('\nShutting down...');
  next.kill();
  if (weStartedDynamo) dynamoLocal.stop(DYNAMO_PORT);
  process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
next.on('exit', cleanup);
