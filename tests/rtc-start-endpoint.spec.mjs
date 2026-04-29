import { test, expect } from '@playwright/test';

// End-to-end sanity for /api/connect-start-rtc. Hits the real Connect
// backend — StartWebRTCContact must return a Chime Meeting + Attendee we
// can join with amazon-chime-sdk-js. Verifies the route + Connect instance
// + flow are WebRTC-capable. Full browser-side media join requires real
// mic/camera hardware + a real agent on the other side; that part is
// left to manual smoke testing.

test('POST /api/connect-start-rtc (voice) returns Chime ConnectionData', async ({ request }) => {
  const res = await request.post('http://localhost:3000/api/connect-start-rtc', {
    data: { displayName: 'E2E Voice', video: false },
  });
  expect(res.ok()).toBe(true);
  const json = await res.json();
  expect(json.contactId).toBeTruthy();
  expect(json.participantId).toBeTruthy();
  expect(json.connectionData?.Meeting?.MediaPlacement?.SignalingUrl).toMatch(/^wss:/);
  expect(json.connectionData?.Attendee?.JoinToken).toBeTruthy();
});

test('POST /api/connect-start-rtc (video) returns Chime ConnectionData', async ({ request }) => {
  const res = await request.post('http://localhost:3000/api/connect-start-rtc', {
    data: { displayName: 'E2E Video', video: true },
  });
  expect(res.ok()).toBe(true);
  const json = await res.json();
  expect(json.connectionData?.Meeting?.MediaPlacement?.SignalingUrl).toMatch(/^wss:/);
  expect(json.connectionData?.Attendee?.JoinToken).toBeTruthy();
});
