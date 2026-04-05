#!/usr/bin/env node

/**
 * Kills DynamoDB Local and wipes the local database.
 * Usage: npm run reset-db
 */

import { rm } from 'fs/promises';
import { join } from 'path';
import { execSync } from 'child_process';

const DATA_DIR = join(process.cwd(), '.data');

// Kill DynamoDB Local Java process
try {
  execSync('pkill -f DynamoDBLocal', { stdio: 'ignore' });
  console.log('Killed DynamoDB Local.');
} catch {
  console.log('DynamoDB Local not running.');
}

// Kill any Next.js dev server (it will lose its DynamoDB connection anyway)
try {
  execSync('pkill -f "next dev"', { stdio: 'ignore' });
  console.log('Killed Next.js dev server.');
} catch {}

// Delete DynamoDB Local data (users, groups, tracks, dumps — all in DynamoDB now)
await rm(join(DATA_DIR, 'dynamodb'), { recursive: true, force: true });
// Clean up any legacy flat files
await rm(join(DATA_DIR, 'users.json'), { force: true });
await rm(join(DATA_DIR, 'groups.json'), { force: true });
await rm(join(DATA_DIR, 'tracks.json'), { force: true });
console.log('Wiped .data/');

console.log('Run `npm run dev` to start fresh.');
