import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { issueAppSession, verifyAppSession, issueMediaGrant, verifyMediaGrant } from '../../src/lib/appTokens.js';
import { safeMagicDestination } from '../../src/lib/magicDestination.js';
import { siteFromHost } from '../../src/lib/siteHost.js';

describe('signed application tokens', () => {
  test('app sessions preserve identity and admin membership', async () => {
    const token = await issueAppSession({ sub: 'user-1', email: 'user@example.com', groups: ['admin'] });
    assert.deepEqual(await verifyAppSession(token), {
      sub: 'user-1',
      email: 'user@example.com',
      groups: ['admin'],
      isAdmin: true,
    });
    assert.equal(await verifyAppSession(`${token}tampered`), null);
  });

  test('media grants are bound to one track', async () => {
    const token = await issueMediaGrant('track-a');
    assert.equal(await verifyMediaGrant(token, 'track-a'), true);
    assert.equal(await verifyMediaGrant(token, 'track-b'), false);
  });
});

describe('magic-link destination allowlist', () => {
  test('allows only clean Music destinations', () => {
    assert.equal(safeMagicDestination('/'), '/');
    assert.equal(safeMagicDestination('/track/abc?share=one#player'), '/track/abc?share=one#player');
    assert.equal(safeMagicDestination('/dump/my-recordings'), '/dump/my-recordings');
    for (const unsafe of ['https://evil.example/', '//evil.example/', '/admin', '/login', '/track/a/extra', 'javascript:alert(1)']) {
      assert.equal(safeMagicDestination(unsafe), '/');
    }
  });
});

describe('hostname ownership', () => {
  test('keeps the three sites strictly separated', () => {
    assert.equal(siteFromHost('aaronrohrbacher.com'), 'main');
    assert.equal(siteFromHost('music.aaronrohrbacher.com'), 'music');
    assert.equal(siteFromHost('portaputer.aaronrohrbacher.com'), 'portaputer');
    assert.equal(siteFromHost('music.localhost'), 'music');
    assert.equal(siteFromHost('portaputer.localhost'), 'portaputer');
  });
});
