// Web-facing schedule-call endpoint for A-A-Bot. Wraps the same listSlots
// and bookSlot helpers Amazon Connect uses (src/functions/schedule-call.mjs)
// so both the AC flow and the in-browser A-A-Bot book against the same
// Google Calendar without duplicating business-hours logic.
//
// Two actions:
//   GET /api/schedule            → list next open slots
//   POST /api/schedule           → { slotIso, customerName, contactMethod } → book
//
// Missing Google OAuth env vars (normal on plain `npm run dev` without
// `sst shell`) return a 503 the A-A-Bot UI can detect and fall back to
// asking the user to leave a message instead.

import { NextResponse } from 'next/server';
import { listSlots, bookSlot } from '@/functions/schedule-call.mjs';
import { notifyAaron } from '@/lib/notifyAaron.mjs';

function googleConfigured() {
  return !!(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN &&
    process.env.CALENDAR_EMAIL
  );
}

export async function GET(request) {
  if (!googleConfigured()) {
    return NextResponse.json({ error: 'Scheduling not configured.', configured: false }, { status: 503 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const minDate = searchParams.get('minDate') || undefined;
    const { slots, lastSlotIso } = await listSlots(minDate);
    return NextResponse.json({ slots, lastSlotIso });
  } catch (err) {
    console.error('schedule list-slots error:', err);
    return NextResponse.json({ error: 'Failed to list slots.' }, { status: 500 });
  }
}

export async function POST(request) {
  if (!googleConfigured()) {
    return NextResponse.json({ error: 'Scheduling not configured.', configured: false }, { status: 503 });
  }
  try {
    const body = await request.json();
    const { slotIso, customerName, contactMethod } = body || {};
    if (!slotIso || !customerName || !contactMethod) {
      return NextResponse.json({ error: 'slotIso, customerName, and contactMethod are required.' }, { status: 400 });
    }
    // bookSlot expects a slotIsoMap indexed by slot1Iso..slot5Iso. We only
    // have one, so pass it as slot1Iso and choose slotChoice=1.
    const result = await bookSlot({
      slotChoice: '1',
      customerName,
      schedulerEmail: contactMethod,
      slotIsoMap: { slot1Iso: slotIso },
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.reason || 'booking_failed' }, { status: 500 });
    }

    // Fire-and-forget notification to Aaron with full visitor metadata.
    // Don't block the response on it — the booking already succeeded.
    notifyAaron({
      request,
      kind: 'schedule_book',
      payload: {
        name: customerName,
        contactMethod,
        slotIso,
        bookedLabel: result.bookedLabel,
        eventId: result.eventId,
        eventLink: result.eventLink,
      },
    }).catch(() => { /* swallow — we already booked */ });

    return NextResponse.json({
      ok: true,
      eventId: result.eventId,
      eventLink: result.eventLink,
      bookedLabel: result.bookedLabel,
    });
  } catch (err) {
    console.error('schedule book-slot error:', err);
    return NextResponse.json({ error: 'Failed to book.' }, { status: 500 });
  }
}
