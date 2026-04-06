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

import { SESClient, SendEmailCommand } from ‘@aws-sdk/client-ses’;

const SUBJECTS = {
  partial:            ‘Portfolio: visitor stopped by (no message)’,
  message:            ‘Portfolio: new message’,
  message_from_queue: ‘Portfolio: someone waited, then left a message’,
  missed:             ‘Portfolio: visitor stopped by — didn\’t stay’,
};

function formatBody(p) {
  const lines = [];
  if (p.customerName) lines.push(`Name: ${p.customerName}`);
  if (p.contactInfo)  lines.push(`Contact: ${p.contactInfo}`);
  if (p.endpoint)     lines.push(`Endpoint: ${p.endpoint}`);
  if (p.channel)      lines.push(`Channel: ${p.channel}`);
  return lines.join(‘\n’) || ‘(no details)’;
}

const ses = new SESClient({});

export async function handler(event) {
  const to = process.env.CONTACT_EMAIL_TO;
  const from = process.env.NOTIFY_FROM_EMAIL;
  if (!to || !from) {
    console.error(‘connect-notify: missing CONTACT_EMAIL_TO or NOTIFY_FROM_EMAIL’);
    return {};
  }

  const params = event?.Details?.Parameters ?? {};
  const notifyType = params.notifyType ?? ‘unknown’;
  const subject = SUBJECTS[notifyType] ?? `Portfolio Connect: ${notifyType}`;

  try {
    await ses.send(new SendEmailCommand({
      Source: from,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject },
        Body: { Text: { Data: formatBody(params) } },
      },
    }));
  } catch (err) {
    console.error(‘connect-notify send failed:’, err);
  }
  return {};
}
