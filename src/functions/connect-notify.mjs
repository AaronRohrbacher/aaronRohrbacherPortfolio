// Invoked by Amazon Connect contact flows to email Aaron when a visitor
// reaches a decision point on the portfolio site: leaves a message,
// requests a voice callback, or disconnects before reaching an agent.
//
// Event shape (Connect InvokeLambdaFunction):
//   event.Details.Parameters = {
//     notifyType, contactId, channel,
//     endpoint?, customerName?, contactInfo?, voiceCallbackInfo?
//   }
//
// Connect ignores the response unless keys are set as contact attributes.
// We don't need any — just return {} and let the flow continue.

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const SUBJECTS = {
  partial:            'Portfolio: visitor stopped by (no message)',
  message:            'Portfolio: new message',
  message_from_queue: 'Portfolio: someone waited, then left a message',
  missed:             'Portfolio: visitor stopped by — didn\'t stay',
  voicemail_request:  'Portfolio: visitor wants a callback',
  schedule:           'Portfolio: meeting booked',
};

function formatBody(p, event) {
  const lines = [];
  const attrs = event?.Details?.ContactData?.Attributes ?? {};

  // Visitor-provided info
  if (p.customerName)    lines.push(`Name:     ${p.customerName}`);
  if (p.contactInfo)     lines.push(`Contact:  ${p.contactInfo}`);
  if (p.customerMessage) lines.push(`Message:  ${p.customerMessage}`);
  if (p.bookedTime)      lines.push(`Appt:     ${p.bookedTime}`);

  // Visitor IP — from Lambda params or widget-set contact attributes
  const visitorIp = p.visitorIp || attrs.visitorIp;
  if (visitorIp)         lines.push(`IP:       ${visitorIp}`);

  lines.push('');

  // Visitor metadata set by widget JS
  if (attrs.pageUrl)    lines.push(`Page:     ${attrs.pageUrl}`);
  if (attrs.userAgent)  lines.push(`UA:       ${attrs.userAgent}`);
  if (attrs.referrer && attrs.referrer !== 'direct')
                        lines.push(`Referrer: ${attrs.referrer}`);

  // Connect metadata
  if (p.contactId)  lines.push(`Contact:  ${p.contactId}`);
  if (p.channel)    lines.push(`Channel:  ${p.channel}`);
  if (p.endpoint)   lines.push(`Endpoint: ${p.endpoint}`);
  if (p.notifyType) lines.push(`Type:     ${p.notifyType}`);

  // Session data from ContactData
  const cd = event?.Details?.ContactData;
  if (cd) {
    if (cd.InitiationTimestamp) lines.push(`Started:  ${cd.InitiationTimestamp}`);
    if (cd.Queue?.Name)         lines.push(`Queue:    ${cd.Queue.Name}`);
  }

  // Any remaining contact attributes not already surfaced
  const shown = new Set([
    'visitorIp', 'pageUrl', 'userAgent', 'referrer',
    'customerName', 'contactInfo', 'customerMessage',
    'offlineChoice', 'callType', 'slotChoice', 'scheduleMinDate',
  ]);
  const extra = Object.entries(attrs).filter(([k, v]) => v && !shown.has(k));
  if (extra.length) {
    lines.push('');
    for (const [k, v] of extra) lines.push(`${k}: ${v}`);
  }

  return lines.join('\n') || '(no details)';
}

const ses = new SESClient({});

// ── Lex V2 dialog code hook ──────────────────────────────────────────
// When AlphaNumeric can't capture the slot (e.g. email with @), Lex
// falls back to FallbackIntent. This hook captures the raw text and
// returns it as if CollectText succeeded with the slot filled.
function handleLexEvent(event) {
  const inputText = (event.inputTranscript || '').trim();
  const intentName = event.sessionState?.intent?.name;
  const sessionAttrs = event.sessionState?.sessionAttributes || {};

  // FallbackIntent: user typed something AlphaNumeric couldn't match.
  // Switch to CollectText with the raw text as the slot value.
  if (intentName === 'FallbackIntent' && inputText) {
    return {
      sessionState: {
        dialogAction: { type: 'Close' },
        intent: {
          name: 'CollectText',
          slots: {
            userInput: {
              shape: 'Scalar',
              value: {
                originalValue: inputText,
                resolvedValues: [inputText],
                interpretedValue: inputText,
              },
            },
          },
          state: 'Fulfilled',
          confirmationState: 'None',
        },
        sessionAttributes: sessionAttrs,
      },
    };
  }

  // CollectText matched — always use raw inputTranscript to preserve spaces,
  // @ signs, and other characters that AlphaNumeric strips
  if (intentName === 'CollectText') {
    return {
      sessionState: {
        dialogAction: { type: 'Close' },
        intent: {
          name: 'CollectText',
          slots: {
            userInput: {
              shape: 'Scalar',
              value: {
                originalValue: inputText,
                resolvedValues: [inputText],
                interpretedValue: inputText,
              },
            },
          },
          state: 'Fulfilled',
          confirmationState: 'None',
        },
        sessionAttributes: sessionAttrs,
      },
    };
  }

  // Anything else: pass through
  return { sessionState: event.sessionState };
}

export async function handler(event) {
  // Lex V2 dialog code hook — detect by presence of sessionState
  if (event.sessionState) {
    return handleLexEvent(event);
  }

  const params = event?.Details?.Parameters ?? {};

  // Utility: title-case a customer name (capitalize first letter of each word,
  // preserve any other capitals the customer typed)
  if (params.action === 'format-name') {
    const name = (params.customerName || '').trim();
    const formatted = name.replace(/\b[a-z]/g, c => c.toUpperCase());
    return { formattedName: formatted || name };
  }

  const to = process.env.CONTACT_EMAIL_TO;
  const from = process.env.NOTIFY_FROM_EMAIL;
  if (!to || !from) {
    console.error('connect-notify: missing CONTACT_EMAIL_TO or NOTIFY_FROM_EMAIL');
    return {};
  }

  const notifyType = params.notifyType ?? 'unknown';
  const subject = SUBJECTS[notifyType] ?? `Portfolio Connect: ${notifyType}`;

  try {
    await ses.send(new SendEmailCommand({
      Source: from,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject },
        Body: { Text: { Data: formatBody(params, event) } },
      },
    }));
  } catch (err) {
    console.error('connect-notify send failed:', err);
  }
  return {};
}
