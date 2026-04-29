import { ConnectClient, StartWebRTCContactCommand } from '@aws-sdk/client-connect';
import { NextResponse } from 'next/server';

const INSTANCE_ID = process.env.CONNECT_INSTANCE_ID;
// WebRTC contacts (voice + video) need a VOICE-channel-compatible contact
// flow. The chat flow uses MessageParticipant/Lex actions that silently
// stall a VOICE contact, leaving it orphaned (never routed to queue).
const CONTACT_FLOW_ID = process.env.CONNECT_VOICE_FLOW_ID || process.env.CONNECT_CONTACT_FLOW_ID;
const REGION = process.env.AWS_REGION || 'us-west-2';

// Body: { displayName?: string, video?: boolean }
// Returns the Chime SDK ConnectionData (Meeting + Attendee) so the browser
// can join via amazon-chime-sdk-js.
export async function POST(request) {
  if (!INSTANCE_ID || !CONTACT_FLOW_ID) {
    return NextResponse.json(
      { error: 'Connect not configured' },
      { status: 500 },
    );
  }
  let body = {};
  try { body = await request.json(); } catch { /* empty body ok */ }
  const displayName = (body?.displayName || 'Website Visitor').toString().slice(0, 256);
  const wantVideo = Boolean(body?.video);

  const allowedCapabilities = wantVideo
    ? { Customer: { Video: 'SEND' }, Agent: { Video: 'SEND' } }
    : undefined;

  try {
    const client = new ConnectClient({ region: REGION });
    const resp = await client.send(new StartWebRTCContactCommand({
      InstanceId: INSTANCE_ID,
      ContactFlowId: CONTACT_FLOW_ID,
      ParticipantDetails: { DisplayName: displayName },
      ...(allowedCapabilities ? { AllowedCapabilities: allowedCapabilities } : {}),
    }));
    return NextResponse.json({
      contactId: resp.ContactId,
      participantId: resp.ParticipantId,
      participantToken: resp.ParticipantToken,
      connectionData: resp.ConnectionData,
      region: REGION,
    });
  } catch (err) {
    console.error('connect-start-rtc error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
