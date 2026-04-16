// Unit tests for the A-A-Bot chat logic. Covers the pure-function core
// (intent detection, collecting-flow state machine, contact policy,
// off-topic safety net). React rendering is tested separately via Playwright.
//
// Run with: node --test tests/unit/chatAgent.test.mjs

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  detectIntent,
  isLikelyOffTopic,
  isBailOut,
  looksLikeQuestion,
  advanceCollectingFlow,
  cleanResponse,
  contactPolicy,
} from '../../src/lib/chatAgent.mjs';

// ── detectIntent ─────────────────────────────────────────────────────────────

describe('detectIntent', () => {
  test('recognizes live chat phrasings', () => {
    assert.equal(detectIntent('open a live chat'), 'chat');
    assert.equal(detectIntent('can I chat with aaron?'), 'chat');
    assert.equal(detectIntent('connect me'), 'chat');
    assert.equal(detectIntent('talk to him'), 'chat');
    assert.equal(detectIntent('is he online?'), 'chat');
    assert.equal(detectIntent('chat'), 'chat');
    assert.equal(detectIntent('CONNECT'), 'chat');
  });

  test('recognizes voice call phrasings', () => {
    assert.equal(detectIntent('can we voice call?'), 'call');
    assert.equal(detectIntent('call aaron'), 'call');
    assert.equal(detectIntent('I want to call him'), 'call');
  });

  test('recognizes video call phrasings', () => {
    assert.equal(detectIntent('start a video call'), 'video');
    assert.equal(detectIntent('can we facetime?'), 'video');
    assert.equal(detectIntent('video with aaron please'), 'video');
  });

  test('recognizes contact-info requests', () => {
    assert.equal(detectIntent("what's his email address?"), 'contact');
    assert.equal(detectIntent('can you send me his contact details?'), 'contact');
    assert.equal(detectIntent('phone number please'), 'contact');
  });

  test('recognizes leave-message phrasings', () => {
    assert.equal(detectIntent('leave a message for aaron'), 'message');
    assert.equal(detectIntent('tell aaron I said hi'), 'message');
    assert.equal(detectIntent('please pass along that we miss him'), 'message');
  });

  test('recognizes schedule-a-call phrasings', () => {
    assert.equal(detectIntent('schedule a call'), 'schedule');
    assert.equal(detectIntent('book a call'), 'schedule');
    assert.equal(detectIntent('can we set up a meeting?'), 'schedule');
    assert.equal(detectIntent('what are his open times?'), 'schedule');
    assert.equal(detectIntent('schedule'), 'schedule');
    assert.equal(detectIntent('calendar'), 'schedule');
    assert.equal(detectIntent('book aaron'), 'schedule');
  });

  test('returns null for Q&A questions', () => {
    assert.equal(detectIntent('what languages does he know?'), null);
    assert.equal(detectIntent('tell me about his AWS experience'), null);
    assert.equal(detectIntent('where is he based?'), null);
    assert.equal(detectIntent('how much experience does he have?'), null);
  });

  test('returns null for empty / non-string input', () => {
    assert.equal(detectIntent(''), null);
    assert.equal(detectIntent('   '), null);
    assert.equal(detectIntent(null), null);
    assert.equal(detectIntent(undefined), null);
    assert.equal(detectIntent(42), null);
  });
});

// ── isLikelyOffTopic ─────────────────────────────────────────────────────────

describe('isLikelyOffTopic', () => {
  test('returns false for Aaron/career questions', () => {
    assert.equal(isLikelyOffTopic('what does Aaron do?'), false);
    assert.equal(isLikelyOffTopic('tell me about his projects'), false);
    assert.equal(isLikelyOffTopic('is he hiring?'), false);
    assert.equal(isLikelyOffTopic('what languages does he code in?'), false);
  });

  test('returns true for clearly-offtopic with no Aaron signal', () => {
    assert.equal(isLikelyOffTopic("what's the weather today?"), true);
    assert.equal(isLikelyOffTopic('2 + 2'), true);
    assert.equal(isLikelyOffTopic('translate to Spanish: hello'), true);
  });

  test('returns false for unknown-but-possibly-relevant questions — model decides', () => {
    // The model, not a regex, should handle these. We only short-circuit
    // the obvious stuff.
    assert.equal(isLikelyOffTopic('favorite color?'), false);
    assert.equal(isLikelyOffTopic('what is life?'), false);
    assert.equal(isLikelyOffTopic('can you tell me a joke?'), false);
  });

  test('returns false for empty input', () => {
    assert.equal(isLikelyOffTopic(''), false);
    assert.equal(isLikelyOffTopic(null), false);
  });
});

// ── isBailOut ────────────────────────────────────────────────────────────────

describe('isBailOut', () => {
  test('detects bail words', () => {
    assert.equal(isBailOut('no'), true);
    assert.equal(isBailOut('NOPE'), true);
    assert.equal(isBailOut('cancel'), true);
    assert.equal(isBailOut('nevermind'), true);
    assert.equal(isBailOut('never mind'), true);
    assert.equal(isBailOut('stop'), true);
    assert.equal(isBailOut('exit.'), true);
  });

  test('ignores non-bail input', () => {
    assert.equal(isBailOut('no worries, continue'), false);
    assert.equal(isBailOut('Jane Doe'), false);
    assert.equal(isBailOut(''), false);
  });
});

// ── looksLikeQuestion ────────────────────────────────────────────────────────

describe('looksLikeQuestion', () => {
  test('detects question marks and wh-words', () => {
    assert.equal(looksLikeQuestion('what is his role?'), true);
    assert.equal(looksLikeQuestion('Does he know Rust'), true);
    assert.equal(looksLikeQuestion('tell me about forbes'), true);
    assert.equal(looksLikeQuestion('how'), true);
  });

  test('returns false for plain statements', () => {
    assert.equal(looksLikeQuestion('Jane Doe'), false);
    assert.equal(looksLikeQuestion('jane@example.com'), false);
    assert.equal(looksLikeQuestion('please call me back'), false);
    assert.equal(looksLikeQuestion(''), false);
  });
});

// ── advanceCollectingFlow: message flow ─────────────────────────────────────

describe('advanceCollectingFlow (message)', () => {
  test('name → contact_method step', () => {
    const state = { type: 'message', step: 'name', data: {} };
    const res = advanceCollectingFlow(state, 'Jane Doe');
    assert.equal(res.next.step, 'contact_method');
    assert.equal(res.next.data.name, 'Jane Doe');
    assert.match(res.assistant, /Jane Doe/);
    assert.match(res.assistant, /email or phone/i);
    assert.equal(res.submit, undefined);
  });

  test('contact_method → message step', () => {
    const state = { type: 'message', step: 'contact_method', data: { name: 'Jane' } };
    const res = advanceCollectingFlow(state, 'jane@example.com');
    assert.equal(res.next.step, 'message');
    assert.equal(res.next.data.contactMethod, 'jane@example.com');
    assert.match(res.assistant, /tell Aaron/i);
  });

  test('message step → completes with submit payload', () => {
    const state = {
      type: 'message',
      step: 'message',
      data: { name: 'Jane', contactMethod: 'jane@example.com' },
    };
    const res = advanceCollectingFlow(state, 'Hi Aaron, interested in a project.');
    assert.equal(res.next, null);
    assert.deepEqual(res.submit, {
      type: 'message',
      name: 'Jane',
      contactMethod: 'jane@example.com',
      message: 'Hi Aaron, interested in a project.',
    });
  });

  test('bail out at any step clears state', () => {
    const state = { type: 'message', step: 'contact_method', data: { name: 'Jane' } };
    const res = advanceCollectingFlow(state, 'cancel');
    assert.equal(res.next, null);
    assert.match(res.assistant, /What else can I help/i);
    assert.equal(res.submit, undefined);
  });
});

// ── advanceCollectingFlow: contact flow ─────────────────────────────────────

describe('advanceCollectingFlow (contact_request)', () => {
  test('name → contact_method step', () => {
    const state = { type: 'contact', step: 'name', data: {} };
    const res = advanceCollectingFlow(state, 'Jane');
    assert.equal(res.next.step, 'contact_method');
    assert.equal(res.next.data.name, 'Jane');
    assert.match(res.assistant, /Jane/);
  });

  test('contact_method step → completes with contact_request payload', () => {
    const state = { type: 'contact', step: 'contact_method', data: { name: 'Jane' } };
    const res = advanceCollectingFlow(state, 'jane@example.com');
    assert.equal(res.next, null);
    assert.deepEqual(res.submit, {
      type: 'contact_request',
      name: 'Jane',
      contactMethod: 'jane@example.com',
    });
  });
});

describe('advanceCollectingFlow (misuse)', () => {
  test('null state returns null next', () => {
    const res = advanceCollectingFlow(null, 'anything');
    assert.equal(res.next, null);
  });
});

// ── advanceCollectingFlow: schedule flow ────────────────────────────────────

describe('advanceCollectingFlow (schedule)', () => {
  const slots = [
    { iso: '2026-05-01T18:00:00-07:00', label: 'Thu May 1, 11:00am PT' },
    { iso: '2026-05-01T18:30:00-07:00', label: 'Thu May 1, 11:30am PT' },
    { iso: '2026-05-02T18:00:00-07:00', label: 'Fri May 2, 11:00am PT' },
  ];

  test('pick_slot accepts a valid numeric choice', () => {
    const state = { type: 'schedule', step: 'pick_slot', data: { slots } };
    const res = advanceCollectingFlow(state, '2');
    assert.equal(res.next.step, 'name');
    assert.equal(res.next.data.slotIso, slots[1].iso);
    assert.equal(res.next.data.slotLabel, slots[1].label);
    assert.match(res.assistant, /11:30am/);
  });

  test('pick_slot rejects invalid choice without advancing', () => {
    const state = { type: 'schedule', step: 'pick_slot', data: { slots } };
    const res = advanceCollectingFlow(state, '99');
    assert.equal(res.next, state);
    assert.match(res.assistant, /number from 1 to 3/);
  });

  test('name step advances to contact_method', () => {
    const state = {
      type: 'schedule',
      step: 'name',
      data: { slots, slotIso: slots[0].iso, slotLabel: slots[0].label },
    };
    const res = advanceCollectingFlow(state, 'Jane Doe');
    assert.equal(res.next.step, 'contact_method');
    assert.equal(res.next.data.name, 'Jane Doe');
    assert.match(res.assistant, /email.*calendar invite/i);
  });

  test('contact_method step completes with schedule_book payload', () => {
    const state = {
      type: 'schedule',
      step: 'contact_method',
      data: {
        slots,
        slotIso: slots[0].iso,
        slotLabel: slots[0].label,
        name: 'Jane Doe',
      },
    };
    const res = advanceCollectingFlow(state, 'jane@example.com');
    assert.equal(res.next, null);
    assert.deepEqual(res.submit, {
      type: 'schedule_book',
      slotIso: slots[0].iso,
      slotLabel: slots[0].label,
      name: 'Jane Doe',
      contactMethod: 'jane@example.com',
    });
    assert.match(res.assistant, /Booking/);
  });

  test('bail out during scheduling clears state', () => {
    const state = { type: 'schedule', step: 'pick_slot', data: { slots } };
    const res = advanceCollectingFlow(state, 'nevermind');
    assert.equal(res.next, null);
    assert.match(res.assistant, /What else can I help/i);
  });
});

// ── cleanResponse ────────────────────────────────────────────────────────────

describe('cleanResponse', () => {
  test('strips bold markdown', () => {
    assert.equal(cleanResponse('**Aaron** is a dev.'), 'Aaron is a dev.');
  });

  test('strips italic markdown', () => {
    assert.equal(cleanResponse('He *really* codes.'), 'He really codes.');
  });

  test('strips bullet lines', () => {
    const input = '- JavaScript\n- Python\n- Rust';
    assert.equal(cleanResponse(input), 'JavaScript\nPython\nRust');
  });

  test('strips numbered list markers', () => {
    const input = '1. JavaScript\n2. Python';
    assert.equal(cleanResponse(input), 'JavaScript\nPython');
  });

  test('collapses excessive blank lines', () => {
    assert.equal(cleanResponse('one\n\n\n\ntwo'), 'one\n\ntwo');
  });

  test('trims whitespace', () => {
    assert.equal(cleanResponse('   hello   '), 'hello');
  });

  test('handles non-string input', () => {
    assert.equal(cleanResponse(null), '');
    assert.equal(cleanResponse(undefined), '');
    assert.equal(cleanResponse(42), '');
  });
});

// ── contactPolicy ────────────────────────────────────────────────────────────

describe('contactPolicy', () => {
  test('message intent always starts the message flow', () => {
    assert.deepEqual(contactPolicy('message', { online: true }), {
      action: 'start',
      flow: 'message',
    });
    assert.deepEqual(contactPolicy('message', { online: false }), {
      action: 'start',
      flow: 'message',
    });
  });

  test('contact intent always starts the contact flow', () => {
    assert.deepEqual(contactPolicy('contact', { online: true }), {
      action: 'start',
      flow: 'contact',
    });
  });

  test('chat/call/video launch widget when online', () => {
    assert.deepEqual(contactPolicy('chat', { online: true }), {
      action: 'launch',
      channel: 'chat',
    });
    assert.deepEqual(contactPolicy('call', { online: true }), {
      action: 'launch',
      channel: 'call',
    });
    assert.deepEqual(contactPolicy('video', { online: true }), {
      action: 'launch',
      channel: 'video',
    });
  });

  test('chat/call/video produce offline notice when AC offline', () => {
    assert.deepEqual(contactPolicy('chat', { online: false }), {
      action: 'offline_notice',
      channel: 'chat',
    });
    assert.deepEqual(contactPolicy('call', { online: false }), {
      action: 'offline_notice',
      channel: 'call',
    });
  });

  test('schedule intent always starts the schedule flow', () => {
    assert.deepEqual(contactPolicy('schedule', { online: true }), {
      action: 'start',
      flow: 'schedule',
    });
    assert.deepEqual(contactPolicy('schedule', { online: false }), {
      action: 'start',
      flow: 'schedule',
    });
  });

  test('null intent returns null', () => {
    assert.equal(contactPolicy(null, { online: true }), null);
  });
});

