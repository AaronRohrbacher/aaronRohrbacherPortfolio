import { ConnectClient, StartChatContactCommand } from '@aws-sdk/client-connect';
import { NextResponse } from 'next/server';

const INSTANCE_ID = process.env.CONNECT_INSTANCE_ID;
const CONTACT_FLOW_ID = process.env.CONNECT_CONTACT_FLOW_ID;
const REGION = process.env.AWS_REGION || 'us-west-2';

export async function POST(request) {
  if (!INSTANCE_ID || !CONTACT_FLOW_ID) {
    return NextResponse.json(
      { error: 'Connect not configured (CONNECT_INSTANCE_ID or CONNECT_CONTACT_FLOW_ID missing)' },
      { status: 500 },
    );
  }

  let body = {};
  try { body = await request.json(); } catch { /* empty body ok */ }
  const displayName = (body?.displayName || 'Website Visitor').toString().slice(0, 256);

  try {
    const client = new ConnectClient({ region: REGION });
    const resp = await client.send(new StartChatContactCommand({
      InstanceId: INSTANCE_ID,
      ContactFlowId: CONTACT_FLOW_ID,
      ParticipantDetails: { DisplayName: displayName },
      SupportedMessagingContentTypes: ['text/plain', 'text/markdown'],
      ChatDurationInMinutes: 60,
    }));
    return NextResponse.json({
      contactId: resp.ContactId,
      participantId: resp.ParticipantId,
      participantToken: resp.ParticipantToken,
      region: REGION,
    });
  } catch (err) {
    console.error('connect-start-chat error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
