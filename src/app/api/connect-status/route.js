import { ConnectClient, GetCurrentMetricDataCommand } from '@aws-sdk/client-connect';
import { NextResponse } from 'next/server';

const INSTANCE_ID = process.env.CONNECT_INSTANCE_ID;
const AGENT_ID = process.env.CONNECT_AGENT_ID;
const REGION = 'us-west-2';

let cached = { online: false, ts: 0 };
const TTL = 15000; // 15s cache to avoid hammering the API

export async function GET() {
  if (!INSTANCE_ID || !AGENT_ID) {
    return NextResponse.json({ online: false });
  }

  if (Date.now() - cached.ts < TTL) {
    return NextResponse.json({ online: cached.online });
  }

  try {
    const client = new ConnectClient({ region: REGION });
    const resp = await client.send(new GetCurrentMetricDataCommand({
      InstanceId: INSTANCE_ID,
      Filters: {
        Queues: [],
        Channels: ['CHAT'],
        RoutingProfiles: [],
      },
      Groupings: ['QUEUE'],
      CurrentMetrics: [
        { Name: 'AGENTS_ONLINE', Unit: 'COUNT' },
      ],
    }));

    const online = resp.MetricResults?.some(r =>
      r.Collections?.some(c => c.Metric?.Name === 'AGENTS_ONLINE' && c.Value > 0)
    ) ?? false;

    cached = { online, ts: Date.now() };
    return NextResponse.json({ online });
  } catch (err) {
    console.error('connect-status error:', err.message);
    return NextResponse.json({ online: false });
  }
}
