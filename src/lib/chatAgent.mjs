// Pure logic for the A-A-Bot chat widget. Keeping this ESM-only so node:test
// can import it without a bundler. React state + DOM stay in ChatAgent.jsx;
// anything that can be reasoned about as a pure function lives here.

// ── Intent detection ─────────────────────────────────────────────────────────
// Maps a user message to one of: 'chat', 'call', 'video', 'message', 'contact',
// or null (treat as a question — send to model). Phrased to only fire when the
// user is *asking* for contact, not *asking about* how Aaron contacts people.

const CALL_RE = /\b(call me|phone me|voice (call|chat)|call (aaron|him)|ring (aaron|him)|can i call|id like to call|i want to call)\b/i;
const VIDEO_RE = /\b(video (call|chat)|face ?time|facetime|video (with|to) (aaron|him)|webcam|i want (a )?video)\b/i;
const CHAT_RE = /\b(live chat|open.*chat|start.*chat|launch.*chat|begin.*chat|chat.*now|connect me|connect.*(aaron|him)|chat with (aaron|him)|talk to (aaron|him)|speak (to|with) (aaron|him)|reach (aaron|him) now|is he (online|available|around)|get me aaron)\b/i;
const CONTACT_RE = /\b(contact info|contact details|phone number|email address|how.*(reach|contact)|send.*(your|his) (info|details)|share.*(info|details))\b/i;
const MESSAGE_RE = /\b(leave.*(message|note)|tell aaron|message for|pass along|let him know|send a message|take a message)\b/i;
const SCHEDULE_RE = /\b(schedule|book|set up|reserve).*\b(call|meeting|time|slot|chat)s?\b|\b(calendar|appointment)\b|\bbook (aaron|him|a time)\b|\b(next|open) (time|slot|availability)s?\b/i;

// Single-word shortcuts that mean "open chat" without any modifier.
const SHORT_CHAT = /^\s*(chat|connect|live chat)[\s!?.]*$/i;
const SHORT_SCHEDULE = /^\s*(schedule|book|calendar|appointment)[\s!?.]*$/i;

export function detectIntent(text) {
  if (typeof text !== 'string') return null;
  const t = text.trim();
  if (!t) return null;
  if (SHORT_CHAT.test(t)) return 'chat';
  if (SHORT_SCHEDULE.test(t)) return 'schedule';
  if (SCHEDULE_RE.test(t)) return 'schedule';
  if (CALL_RE.test(t)) return 'call';
  if (VIDEO_RE.test(t)) return 'video';
  if (CHAT_RE.test(t)) return 'chat';
  if (CONTACT_RE.test(t)) return 'contact';
  if (MESSAGE_RE.test(t)) return 'message';
  return null;
}

// ── Off-topic safety net ─────────────────────────────────────────────────────
// Reasonable exception: if the question has no domain signal AND is clearly
// not about Aaron, don't burn tokens on the model — respond briefly. We keep
// this narrow on purpose so the model handles nearly everything itself.

// Words/phrases that indicate a question is either about Aaron or about the
// kinds of things Aaron's assistant should answer (tech, career, hiring,
// projects, hobbies, location).
const DOMAIN_RE = /\b(aaron|rohrbacher|you|your|he|his|him|himself|resume|portfolio|work|worked|working|job|role|career|skill|skills|language|languages|code|coding|program|programming|built|build|building|project|projects|cert|certs|certification|certifications|cloud|aws|gcp|azure|docker|kubernetes|k8s|devops|python|rust|swift|kotlin|java|typescript|javascript|ruby|sql|bash|php|node|react|next|ember|startup|cto|engineer|engineering|experience|background|portfolio|company|employer|sparq|forbes|nuel|nordic|planet ?argon|fiduciary|ai|ml|llm|pytorch|nlp|lex|polly|saxophone|music|portland|oregon|hire|hiring|available|seeking|contact|email|phone|reach|open to|level|lead|senior|specialty|specialties|tool|tools|tech|stack|infra|infrastructure|terraform|deploy|hobby|hobbies|what do you|who is|tell me about|what can you|do you know)\b/i;

// Clearly-off-topic buckets: if a message hits one of these AND has no domain
// signal, we treat it as off-topic. "What's the weather?" "How's the stock
// market?" etc. This stays tiny on purpose — the model can answer most things.
const CLEARLY_OFFTOPIC_RE = /\b(weather|stock market|price of|sports score|lottery|horoscope|recipe|translate to|\d+\s*[+\-*/]\s*\d+)\b/i;

export function isLikelyOffTopic(text) {
  if (typeof text !== 'string') return false;
  const t = text.trim();
  if (!t) return false;
  if (DOMAIN_RE.test(t)) return false;
  return CLEARLY_OFFTOPIC_RE.test(t);
}

// ── Bail-out patterns for collecting flows ───────────────────────────────────

const BAIL_RE = /^(no|nah|nope|cancel|nevermind|never\s?mind|stop|quit|back|exit)[.!?\s]*$/i;

export function isBailOut(text) {
  if (typeof text !== 'string') return false;
  return BAIL_RE.test(text.trim());
}

// "Did the user type a question instead of answering the prompt?" — used by
// the collecting flow to break out and answer the question instead.
export function looksLikeQuestion(text) {
  if (typeof text !== 'string') return false;
  const t = text.trim();
  if (!t) return false;
  if (t.includes('?')) return true;
  return /^(what|who|where|when|why|how|does|did|is|are|can|could|would|should|tell me|do you)\b/i.test(t);
}

// ── Collecting flow state machine (message + contact_request) ────────────────
// Pure reducer — takes current state and a user reply, returns:
//   { next: newState | null, assistant: string, submit?: payload }
// null next = flow complete or bailed.

export function advanceCollectingFlow(state, reply) {
  if (!state) return { next: null, assistant: '' };

  if (isBailOut(reply)) {
    return { next: null, assistant: `No problem! What else can I help with?` };
  }

  if (state.type === 'message') {
    if (state.step === 'name') {
      return {
        next: { ...state, step: 'contact_method', data: { ...state.data, name: reply } },
        assistant: `Thanks, ${reply}! What's the best way for Aaron to reach you? (email or phone number)`,
      };
    }
    if (state.step === 'contact_method') {
      return {
        next: { ...state, step: 'message', data: { ...state.data, contactMethod: reply } },
        assistant: `Got it. What would you like to tell Aaron?`,
      };
    }
    if (state.step === 'message') {
      return {
        next: null,
        assistant: `Sending your message to Aaron...`,
        submit: {
          type: 'message',
          name: state.data.name,
          contactMethod: state.data.contactMethod,
          message: reply,
        },
      };
    }
  }

  if (state.type === 'contact') {
    if (state.step === 'name') {
      return {
        next: { ...state, step: 'contact_method', data: { ...state.data, name: reply } },
        assistant: `Thanks, ${reply}! Where should Aaron send his contact info? (email or phone number)`,
      };
    }
    if (state.step === 'contact_method') {
      return {
        next: null,
        assistant: `Sending your request to Aaron...`,
        submit: {
          type: 'contact_request',
          name: state.data.name,
          contactMethod: reply,
        },
      };
    }
  }

  // Scheduling a 30-minute call on Aaron's Google Calendar.
  // Steps:
  //   pick_slot → user types/clicks a slot number or ISO → name
  //   name      → contact_method
  //   contact_method → complete + submit booking
  if (state.type === 'schedule') {
    if (state.step === 'pick_slot') {
      const n = parseInt(reply, 10);
      const slots = state.data.slots || [];
      let chosen = null;
      if (Number.isInteger(n) && n >= 1 && n <= slots.length) {
        chosen = slots[n - 1];
      } else if (slots.some((s) => s.iso === reply)) {
        chosen = slots.find((s) => s.iso === reply);
      }
      if (!chosen) {
        return {
          next: state,
          assistant: `Please reply with a number from 1 to ${slots.length}, or type "cancel" to go back.`,
        };
      }
      return {
        next: {
          ...state,
          step: 'name',
          data: { ...state.data, slotIso: chosen.iso, slotLabel: chosen.label },
        },
        assistant: `${chosen.label} it is! What's your name for the calendar invite?`,
      };
    }
    if (state.step === 'name') {
      return {
        next: { ...state, step: 'contact_method', data: { ...state.data, name: reply } },
        assistant: `Thanks, ${reply}! What's your email for the Google Calendar invite? (a phone number works too — Aaron will text a confirmation)`,
      };
    }
    if (state.step === 'contact_method') {
      return {
        next: null,
        assistant: `Booking ${state.data.slotLabel}...`,
        submit: {
          type: 'schedule_book',
          slotIso: state.data.slotIso,
          slotLabel: state.data.slotLabel,
          name: state.data.name,
          contactMethod: reply,
        },
      };
    }
  }

  return { next: state, assistant: '' };
}

// ── Response cleaning ────────────────────────────────────────────────────────
// Only light-touch: strip markdown bullets/bold that the model sometimes emits
// despite the system prompt. No content validation — we trust the model.

export function cleanResponse(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^[*\-•]\s*/gm, '')
    .replace(/^\d+\.\s*/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Contact policy ──────────────────────────────────────────────────────────
// Decide what to do for a contact intent given online/offline state.
// Returns one of:
//   { action: 'launch', channel: 'chat'|'call'|'video' } — open AC widget
//   { action: 'start', flow: 'message'|'contact' }      — start collecting flow
//   { action: 'offline_notice', channel: ... }          — AC offline, suggest fallback

export function contactPolicy(intent, { online }) {
  if (intent === 'message') return { action: 'start', flow: 'message' };
  if (intent === 'contact') return { action: 'start', flow: 'contact' };
  // Scheduling is Google-Calendar-backed and doesn't depend on AC being
  // online, so it's always available as long as scheduling is configured.
  if (intent === 'schedule') return { action: 'start', flow: 'schedule' };

  if (intent === 'chat' || intent === 'call' || intent === 'video') {
    if (online) return { action: 'launch', channel: intent };
    return { action: 'offline_notice', channel: intent };
  }

  return null;
}
