// Unit tests for the music access-control helpers. These mirror the EXACT
// rule the endpoints enforce — no synthetic helpers, no dead code paths.
//
// The rule:
//
//     const admitted = containingDumps.length > 0
//       ? canViewTrackInDumps(containingDumps, { trackId, user, perms })
//       : canViewTrackDirect(track, { user, perms });
//
// "DUMP TRUMPS": if the dump-side index says the track is in any dump,
// only the dumps' visibility tiers decide. The track's own published/
// visibility never participates. Truly loose tracks fall back to the
// track-side gate.
//
// `containingDumps` MUST come from the dump-side index (sibling rows
// under DUMP#<id> via getDumpTracks). Reading track.dumpIds is the wrong
// direction and is what created the original 401-on-play bug — those
// rows can drift from the index.
//
// Run with: node --test tests/unit/canViewTrack.test.mjs

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  canViewTrackDirect,
  canViewTrackInDumps,
  visibilityAdmits,
} from '../../src/lib/trackAccess.mjs';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const anon = null;
const user = { sub: 'user-1', groups: [], email: 'u@local.dev' };

function track(overrides = {}) {
  return {
    id: 't1',
    name: 't1',
    published: false,
    visibility: 'public',
    ...overrides,
  };
}

function dump(overrides = {}) {
  return {
    id: 'd1',
    name: 'd1',
    published: true,
    visibility: 'public',
    ...overrides,
  };
}

const noPerms = new Set();
const grantedPerms = new Set(['t1']);

// The rule the endpoints implement, expressed once and tested directly.
// If a future regression makes an endpoint diverge from this, the
// integration tests will catch it; this unit test pins the rule itself.
function admit(track, containingDumps, opts) {
  return containingDumps.length > 0
    ? canViewTrackInDumps(containingDumps, { trackId: track.id, ...opts })
    : canViewTrackDirect(track, opts);
}

// ── visibilityAdmits — primitive tier check ──────────────────────────────────

describe('visibilityAdmits', () => {
  test('public admits everyone', () => {
    assert.equal(visibilityAdmits('public', 't1', anon, noPerms), true);
    assert.equal(visibilityAdmits('public', 't1', user, noPerms), true);
  });

  test('authenticated admits any signed-in user, denies anon', () => {
    assert.equal(visibilityAdmits('authenticated', 't1', anon, noPerms), false);
    assert.equal(visibilityAdmits('authenticated', 't1', user, noPerms), true);
  });

  test('restricted admits only signed-in users with the track in their permitted set', () => {
    assert.equal(visibilityAdmits('restricted', 't1', anon, grantedPerms), false);
    assert.equal(visibilityAdmits('restricted', 't1', user, noPerms), false);
    assert.equal(visibilityAdmits('restricted', 't1', user, grantedPerms), true);
  });

  test('unknown tier denies everyone', () => {
    assert.equal(visibilityAdmits('wat', 't1', anon, noPerms), false);
    assert.equal(visibilityAdmits('wat', 't1', user, grantedPerms), false);
  });
});

// ── canViewTrackDirect — used ONLY for tracks in zero dumps ──────────────────

describe('canViewTrackDirect · loose-track gate', () => {
  test('unpublished track is never admitted', () => {
    const t = track({ published: false, visibility: 'public' });
    assert.equal(canViewTrackDirect(t, { user: anon }), false);
    assert.equal(canViewTrackDirect(t, { user, permittedTrackIds: grantedPerms }), false);
  });

  for (const [tier, expected] of [
    ['public', { anon: true, user: true, withPerms: true }],
    ['authenticated', { anon: false, user: true, withPerms: true }],
    ['restricted', { anon: false, user: false, withPerms: true }],
  ]) {
    test(`published+${tier}`, () => {
      const t = track({ published: true, visibility: tier });
      assert.equal(canViewTrackDirect(t, { user: anon }), expected.anon);
      assert.equal(canViewTrackDirect(t, { user, permittedTrackIds: noPerms }), expected.user);
      assert.equal(canViewTrackDirect(t, { user, permittedTrackIds: grantedPerms }), expected.withPerms);
    });
  }

  test('null track', () => {
    assert.equal(canViewTrackDirect(null, { user: anon }), false);
  });

  test('missing visibility defaults to public', () => {
    const t = { id: 't1', published: true };
    assert.equal(canViewTrackDirect(t, { user: anon }), true);
  });
});

// ── canViewTrackInDumps — used when the track lives in ≥1 dump ──────────────

describe('canViewTrackInDumps · dump-trumps gate', () => {
  test('empty list denies', () => {
    assert.equal(canViewTrackInDumps([], { trackId: 't1', user: anon }), false);
  });

  test('non-array input denies', () => {
    assert.equal(canViewTrackInDumps(null, { trackId: 't1', user: anon }), false);
    assert.equal(canViewTrackInDumps(undefined, { trackId: 't1', user: anon }), false);
  });

  test('public dump admits anon', () => {
    const d = dump({ visibility: 'public' });
    assert.equal(canViewTrackInDumps([d], { trackId: 't1', user: anon }), true);
  });

  test('authenticated dump denies anon, admits signed-in', () => {
    const d = dump({ visibility: 'authenticated' });
    assert.equal(canViewTrackInDumps([d], { trackId: 't1', user: anon }), false);
    assert.equal(canViewTrackInDumps([d], { trackId: 't1', user, permittedTrackIds: noPerms }), true);
  });

  test('restricted dump requires perms on the track', () => {
    const d = dump({ visibility: 'restricted' });
    assert.equal(canViewTrackInDumps([d], { trackId: 't1', user: anon }), false);
    assert.equal(canViewTrackInDumps([d], { trackId: 't1', user, permittedTrackIds: noPerms }), false);
    assert.equal(canViewTrackInDumps([d], { trackId: 't1', user, permittedTrackIds: grantedPerms }), true);
  });

  test('unpublished dump in the list is skipped', () => {
    const dDead = dump({ id: 'dead', published: false, visibility: 'public' });
    assert.equal(canViewTrackInDumps([dDead], { trackId: 't1', user: anon }), false);
  });

  test('mix of dead + live: live one decides', () => {
    const dDead = dump({ id: 'dead', published: false, visibility: 'public' });
    const dLive = dump({ id: 'live', published: true, visibility: 'public' });
    assert.equal(canViewTrackInDumps([dDead, dLive], { trackId: 't1', user: anon }), true);
  });

  test('any one admitting tier suffices', () => {
    const dRes = dump({ id: 'r', visibility: 'restricted' });
    const dPub = dump({ id: 'p', visibility: 'public' });
    assert.equal(canViewTrackInDumps([dRes, dPub], { trackId: 't1', user: anon }), true);
  });

  test('all denying tiers → denied', () => {
    const dA = dump({ id: 'a', visibility: 'authenticated' });
    const dR = dump({ id: 'r', visibility: 'restricted' });
    assert.equal(canViewTrackInDumps([dA, dR], { trackId: 't1', user: anon }), false);
  });

  test('missing visibility on a dump defaults to public', () => {
    const d = { id: 'x', published: true };
    assert.equal(canViewTrackInDumps([d], { trackId: 't1', user: anon }), true);
  });
});

// ── The full endpoint rule, end-to-end ───────────────────────────────────────
//
// These tests exist because the previous helper used (canViewTrack with an
// internal OR over track.dumpIds) drifted from the dump-side index and
// silently 401'd legitimate plays. They pin the actual rule the endpoints
// run, with `containingDumps` ALWAYS supplied separately from any
// track-side state.

describe('Endpoint rule · DUMP TRUMPS', () => {
  test('truly loose published-public track → anon admitted via direct gate', () => {
    const t = track({ published: true, visibility: 'public' });
    assert.equal(admit(t, [], { user: anon }), true);
  });

  test('truly loose published-restricted track → anon denied, perms-holder admitted', () => {
    const t = track({ published: true, visibility: 'restricted' });
    assert.equal(admit(t, [], { user: anon }), false);
    assert.equal(admit(t, [], { user, permittedTrackIds: grantedPerms }), true);
  });

  test('truly loose unpublished track → denied to everyone', () => {
    const t = track({ published: false });
    assert.equal(admit(t, [], { user: anon }), false);
    assert.equal(admit(t, [], { user, permittedTrackIds: grantedPerms }), false);
  });

  test('unpublished track inside a public dump → anon admitted (dump trumps)', () => {
    const t = track({ published: false, visibility: 'public' });
    const d = dump({ visibility: 'public' });
    assert.equal(admit(t, [d], { user: anon }), true);
  });

  test('unpublished+restricted track inside a public dump → anon admitted (dump trumps)', () => {
    // The exact bug the user hit: track was set restricted by accident,
    // dropped into a public dump. Anon clicking play in the dump page used
    // to 401. Now: dump trumps, play succeeds.
    const t = track({ published: false, visibility: 'restricted' });
    const d = dump({ visibility: 'public' });
    assert.equal(admit(t, [d], { user: anon }), true);
  });

  test('published+restricted track inside a public dump → anon admitted (dump trumps)', () => {
    const t = track({ published: true, visibility: 'restricted' });
    const d = dump({ visibility: 'public' });
    assert.equal(admit(t, [d], { user: anon }), true);
  });

  test('published-public track inside a restricted dump → anon DENIED (dump trumps)', () => {
    // Track-side would have admitted, but dump owns visibility once a
    // dump claims the track. The track's own publish flag is irrelevant.
    const t = track({ published: true, visibility: 'public' });
    const d = dump({ visibility: 'restricted' });
    assert.equal(admit(t, [d], { user: anon }), false);
    assert.equal(admit(t, [d], { user, permittedTrackIds: noPerms }), false);
    assert.equal(admit(t, [d], { user, permittedTrackIds: grantedPerms }), true);
  });

  test('published-public track inside an authenticated dump → anon DENIED', () => {
    const t = track({ published: true, visibility: 'public' });
    const d = dump({ visibility: 'authenticated' });
    assert.equal(admit(t, [d], { user: anon }), false);
    assert.equal(admit(t, [d], { user }), true);
  });

  test('track inside multiple dumps → most permissive wins', () => {
    const t = track({ published: false });
    const dRes = dump({ id: 'r', visibility: 'restricted' });
    const dPub = dump({ id: 'p', visibility: 'public' });
    assert.equal(admit(t, [dRes, dPub], { user: anon }), true);
  });

  test('track inside an unpublished dump only → denied (unpublished dump skipped, no other admit path)', () => {
    const t = track({ published: false });
    const dDead = dump({ published: false, visibility: 'public' });
    assert.equal(admit(t, [dDead], { user: anon }), false);
  });
});

// ── Regression anchors ───────────────────────────────────────────────────────
//
// These test the EXACT bug shapes that have hit prod / dev. Each one
// describes the user-visible failure it pins.

describe('Regression anchors', () => {
  test('Drift bug: track.dumpIds is empty but the dump-side index says it lives in a public dump', () => {
    // Pre-fix: stream endpoint read track.dumpIds (empty) → canViewTrack
    // returned false → 401 on play even though the dump page rendered the
    // track. Post-fix: containingDumps comes from the DUMP-side index, so
    // the empty track.dumpIds is irrelevant.
    const t = { id: 't1', published: false, visibility: 'restricted', dumpIds: [] };
    const d = dump({ visibility: 'public' });
    assert.equal(admit(t, [d], { user: anon }), true,
      'a stale empty track.dumpIds must NOT cause a 401 when the dump-side index shows the dump');
  });

  test('Wrong-tag bug: track.visibility set to restricted by accident, in a public dump', () => {
    const t = track({ published: false, visibility: 'restricted' });
    const d = dump({ visibility: 'public' });
    assert.equal(admit(t, [d], { user: anon }), true);
  });

  test('Strict-mode bug: published-public track shoved into a restricted dump must NOT leak to anon', () => {
    const t = track({ published: true, visibility: 'public' });
    const d = dump({ visibility: 'restricted' });
    assert.equal(admit(t, [d], { user: anon }), false);
  });
});
