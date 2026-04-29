import { ConnectClient, GetCurrentMetricDataCommand } from '@aws-sdk/client-connect';
import { NextResponse } from 'next/server';

// Required env from .env.local / SST secrets:
//   CONNECT_INSTANCE_ID   — the Connect instance UUID
//   CONNECT_QUEUE_ID      — the queue UUID the widget feeds into
//   AWS_REGION (optional) — defaults to us-west-2
//
// GetCurrentMetricData rejects `Filters.Queues: []` — the queue list must
// contain at least one queue or routing-profile id. Before this fix the
// route always errored and fell back to `online: false`, leaving A-A-Bot
// in permanent offline mode.
const INSTANCE_ID = process.env.CONNECT_INSTANCE_ID;
const QUEUE_ID = process.env.CONNECT_QUEUE_ID;
const REGION = process.env.AWS_REGION || 'us-west-2';

let cached = { online: false, ts: 0 };
const TTL = 8000; // 8s cache — keeps load light but reflects agent
                   // Available-flips within ~20s end-to-end (8s server
                   // cache + 15s client poll).

export async function GET() {
  if (!INSTANCE_ID || !QUEUE_ID) {
    return NextResponse.json({ online: false, configured: false });
  }

  if (Date.now() - cached.ts < TTL) {
    return NextResponse.json({ online: cached.online, cached: true });
  }

  try {
    const client = new ConnectClient({ region: REGION });
    const resp = await client.send(new GetCurrentMetricDataCommand({
      InstanceId: INSTANCE_ID,
      Filters: {
        Queues: [QUEUE_ID],
        Channels: ['CHAT'],
      },
      Groupings: ['QUEUE'],
      CurrentMetrics: [
        { Name: 'AGENTS_ONLINE', Unit: 'COUNT' },
        { Name: 'AGENTS_AVAILABLE', Unit: 'COUNT' },
      ],
    }));

    // AGENTS_AVAILABLE is the meaningful signal for "can answer a chat right
    // now". AGENTS_ONLINE includes agents in ACW or on break. Prefer
    // AVAILABLE; fall back to ONLINE if AVAILABLE is unreported.
    const countFor = (name) => {
      for (const r of resp.MetricResults || []) {
        for (const c of r.Collections || []) {
          if (c.Metric?.Name === name && typeof c.Value === 'number') {
            return c.Value;
          }
        }
      }
      return 0;
    };
    const available = countFor('AGENTS_AVAILABLE');
    const onlineCount = countFor('AGENTS_ONLINE');
    const online = available > 0 || onlineCount > 0;

    cached = { online, ts: Date.now() };
    return NextResponse.json({
      online,
      available,
      onlineCount,
    });
  } catch (err) {
    console.error('connect-status error:', err.message);
    return NextResponse.json({ online: false, error: err.message }, { status: 200 });
  }
}
