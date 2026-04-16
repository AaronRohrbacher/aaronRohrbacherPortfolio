// Invoked by Amazon Connect inbound flow to handle the "Schedule a call"
// path. Two actions, dispatched on event.Details.Parameters.action:
//
//   list-slots  — reads Google Calendar freebusy, returns next 5 open
//                 slots within Aaron's business hours as contact attributes
//                 slot1Label..slot5Label (for display) and
//                 slot1Iso..slot5Iso (for booking).
//
//   book-slot   — takes visitor's choice (1-5) + name + email, creates a
//                 Google Calendar event with the visitor as an attendee.
//                 Google sends the calendar invite.
//
// Auth: Google OAuth2 with a refresh token stored in env. Lambda mints
// access tokens on demand (cached by google-auth-library).
//
// Business hours are configured at the top of this file, not via env,
// since changing them requires also adjusting copy + slot math anyway.

import { OAuth2Client } from 'google-auth-library';
import { calendar as calendarApi } from '@googleapis/calendar';
import { DateTime } from 'luxon';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const TZ = 'America/Los_Angeles';
const HORIZON_DAYS = 90;
const MAX_SLOTS_RETURNED = 5;
const MAX_SLOTS_PER_DAY = 2; // spread options across days

// Luxon weekday: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun
const BUSINESS_HOURS = {
  1: { startHour: 11, endHour: 15 },
  2: { startHour: 11, endHour: 15 },
  3: { startHour: 11, endHour: 15 },
  4: { startHour: 11, endHour: 15 },
  5: { startHour: 11, endHour: 14 }, // Friday cut at 2pm
};

function getOauthClient() {
  const client = new OAuth2Client(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET
  );
  client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return client;
}

function getCalendar() {
  return calendarApi({ version: 'v3', auth: getOauthClient() });
}

function meetingDuration() {
  return Number(process.env.MEETING_DURATION_MINUTES) || 30;
}

// Generates candidate 30-min slot starts in LA tz within business hours.
// If minDate is provided (ISO string), skip slots before that datetime.
function generateCandidateSlots(minDate) {
  const durationMin = meetingDuration();
  const now = DateTime.now().setZone(TZ);
  const earliest = minDate
    ? DateTime.fromISO(minDate).setZone(TZ)
    : now;
  const slots = [];

  for (let d = 0; d < HORIZON_DAYS; d++) {
    const day = now.plus({ days: d }).startOf('day');
    const hours = BUSINESS_HOURS[day.weekday];
    if (!hours) continue; // weekend

    // Build slots at :00 and :30 within the window; last slot must END by endHour.
    const dayStart = day.set({ hour: hours.startHour, minute: 0 });
    const dayEnd = day.set({ hour: hours.endHour, minute: 0 });
    let cursor = dayStart;
    while (cursor.plus({ minutes: durationMin }) <= dayEnd) {
      if (cursor > now && cursor > earliest) slots.push(cursor);
      cursor = cursor.plus({ minutes: 30 });
    }
  }
  return slots;
}

// Returns true if [slotStart, slotEnd] overlaps any busy block.
function slotIsBusy(slotStart, slotEnd, busyBlocks) {
  for (const b of busyBlocks) {
    const bStart = DateTime.fromISO(b.start);
    const bEnd = DateTime.fromISO(b.end);
    if (slotStart < bEnd && slotEnd > bStart) return true;
  }
  return false;
}

function labelForSlot(dt) {
  // "Thu Apr 10, 11:00am PT"
  return dt.toFormat("ccc LLL d, h:mma") + ' PT';
}

export async function listSlots(minDate) {
  const durationMin = meetingDuration();
  const calendarId = process.env.CALENDAR_EMAIL;
  const cal = getCalendar();

  const candidates = generateCandidateSlots(minDate);
  if (candidates.length === 0) return { slots: [] };

  const windowStart = candidates[0].toISO();
  const windowEnd = candidates[candidates.length - 1]
    .plus({ minutes: durationMin })
    .toISO();

  const fb = await cal.freebusy.query({
    requestBody: {
      timeMin: windowStart,
      timeMax: windowEnd,
      timeZone: TZ,
      items: [{ id: calendarId }],
    },
  });
  const busy = fb.data.calendars?.[calendarId]?.busy ?? [];

  const perDayCount = {};
  const picked = [];
  for (const start of candidates) {
    const end = start.plus({ minutes: durationMin });
    if (slotIsBusy(start, end, busy)) continue;
    const dayKey = start.toISODate();
    if ((perDayCount[dayKey] ?? 0) >= MAX_SLOTS_PER_DAY) continue;
    perDayCount[dayKey] = (perDayCount[dayKey] ?? 0) + 1;
    picked.push(start);
    if (picked.length >= MAX_SLOTS_RETURNED) break;
  }

  const slots = picked.map((dt) => ({ iso: dt.toISO(), label: labelForSlot(dt) }));
  return {
    slots,
    lastSlotIso: slots.length > 0 ? slots[slots.length - 1].iso : '',
  };
}

export async function bookSlot({ slotChoice, customerName, schedulerEmail, slotIsoMap }) {
  const choiceIdx = Number(slotChoice);
  if (!Number.isInteger(choiceIdx) || choiceIdx < 1 || choiceIdx > 5) {
    return { ok: false, reason: 'invalid_choice' };
  }
  const slotIso = slotIsoMap[`slot${choiceIdx}Iso`];
  if (!slotIso) return { ok: false, reason: 'slot_not_found' };

  const start = DateTime.fromISO(slotIso);
  const end = start.plus({ minutes: meetingDuration() });
  const calendarId = process.env.CALENDAR_EMAIL;
  const cal = getCalendar();

  try {
    const res = await cal.events.insert({
      calendarId,
      sendUpdates: 'all',
      requestBody: {
        summary: `Chat with ${customerName || 'portfolio visitor'}`,
        description: `Scheduled via aaronrohrbacher.com\n${customerName ? `Name: ${customerName}\n` : ''}Contact: ${schedulerEmail || 'not provided'}`,
        start: { dateTime: start.toISO(), timeZone: TZ },
        end: { dateTime: end.toISO(), timeZone: TZ },
        attendees: [
          ...(schedulerEmail && schedulerEmail.includes('@') ? [{ email: schedulerEmail }] : []),
          { email: calendarId },
        ],
        reminders: { useDefault: true },
      },
    });
    // If customer gave a phone number (not email), send SMS confirmation
    const isPhone = schedulerEmail && !schedulerEmail.includes('@') && /\d{7,}/.test(schedulerEmail);
    if (isPhone) {
      try {
        const phone = schedulerEmail.replace(/\D/g, '');
        const e164 = phone.length === 10 ? `+1${phone}` : `+${phone}`;
        const sns = new SNSClient({});
        await sns.send(new PublishCommand({
          PhoneNumber: e164,
          Message: `Hi ${customerName || 'there'}! Your call with Aaron Rohrbacher is confirmed for ${labelForSlot(start)}. See you then!`,
          MessageAttributes: {
            'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' },
          },
        }));
      } catch (smsErr) {
        console.error('SMS send failed:', smsErr?.message || smsErr);
      }
    }

    return { ok: true, eventId: res.data.id, eventLink: res.data.htmlLink, bookedLabel: labelForSlot(start) };
  } catch (err) {
    console.error('book-slot failed:', err?.message || err);
    return { ok: false, reason: 'booking_failed' };
  }
}

export async function handler(event) {
  const params = event?.Details?.Parameters ?? {};
  const action = params.action;

  try {
    if (action === 'list-slots') {
      const { slots, lastSlotIso } = await listSlots(params.minDate);
      // Flatten into contact attributes the flow can reference.
      const out = {
        slotsCount: String(slots.length),
        lastSlotIso: lastSlotIso || '',
      };
      for (let i = 0; i < 5; i++) {
        out[`slot${i + 1}Label`] = slots[i]?.label ?? '';
        out[`slot${i + 1}Iso`] = slots[i]?.iso ?? '';
      }
      // Pre-format the menu so the flow just displays one attribute.
      if (slots.length > 0) {
        const lines = slots.map((s, i) => `${i + 1}. ${s.label}`);
        out.slotsMenuText =
          "Here are Aaron's next open times:\n\n" +
          lines.join('\n') +
          `\n\nReply 1-${slots.length} to book, or 0 to see more.`;
      } else {
        out.slotsMenuText = '';
      }
      return out;
    }

    if (action === 'book-slot') {
      const slotIsoMap = {
        slot1Iso: params.slot1Iso,
        slot2Iso: params.slot2Iso,
        slot3Iso: params.slot3Iso,
        slot4Iso: params.slot4Iso,
        slot5Iso: params.slot5Iso,
      };
      const result = await bookSlot({
        slotChoice: params.slotChoice,
        customerName: params.customerName,
        schedulerEmail: params.schedulerEmail,
        slotIsoMap,
      });
      return {
        bookingOk: result.ok ? 'true' : 'false',
        bookingReason: result.reason || '',
        bookedTime: result.bookedLabel || '',
      };
    }

    return { error: 'unknown_action' };
  } catch (err) {
    console.error('schedule-call handler error:', err?.message || err);
    return { error: 'handler_failed' };
  }
}
