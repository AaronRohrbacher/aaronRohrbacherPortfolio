// Playwright globalSetup: reset the dev DB to a known baseline before every
// run. Polluter specs (music.spec.mjs, share-links.spec.mjs, multi-dump)
// mutate tracks and dumps without restoring; without this the second run
// onwards is at the mercy of whatever the previous run left behind.
//
// Delegates to the same helper that per-file specs import in beforeAll,
// so the baseline definition has one source of truth.

import net from 'node:net';
import { resetMusicDb } from './helpers/reset-music-db.mjs';

const DYNAMO_PORT = 8123;

function portOpen(port) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(500);
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error', () => { sock.destroy(); resolve(false); });
    sock.once('timeout', () => { sock.destroy(); resolve(false); });
    sock.connect(port, '127.0.0.1');
  });
}

export default async function globalSetup() {
  if (!(await portOpen(DYNAMO_PORT))) {
    console.log('[global-setup] DynamoDB Local not running — skipping DB reset.');
    return;
  }
  await resetMusicDb();
  console.log('[global-setup] baseline reset.');
}
