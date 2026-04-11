import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { corsHeaders, resolveSiteKey } from '@/lib/ingest';

export const runtime = 'nodejs';

const schema = z.object({
  callId: z.string().min(1).max(200),
  fromNum: z.string().min(1).max(50),
  toNum: z.string().min(1).max(50),
  direction: z.enum(['inbound', 'outbound']),
  status: z.enum(['answered', 'missed', 'voicemail']),
  duration: z.number().int().nonnegative().default(0),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional().nullable(),
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: Request) {
  const site = await resolveSiteKey(req);
  if (!site) {
    return NextResponse.json(
      { error: 'invalid_site_key' },
      { status: 401, headers: corsHeaders() },
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid_json' },
      { status: 400, headers: corsHeaders() },
    );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_payload', issues: parsed.error.flatten() },
      { status: 400, headers: corsHeaders() },
    );
  }

  // Upsert par callId (idempotent — webhook Telnyx/OVH peut retry).
  await prisma.sipCall.upsert({
    where: { callId: parsed.data.callId },
    create: {
      siteId: site.siteId,
      callId: parsed.data.callId,
      fromNum: parsed.data.fromNum,
      toNum: parsed.data.toNum,
      direction: parsed.data.direction,
      status: parsed.data.status,
      duration: parsed.data.duration,
      startedAt: new Date(parsed.data.startedAt),
      endedAt: parsed.data.endedAt ? new Date(parsed.data.endedAt) : null,
    },
    update: {
      status: parsed.data.status,
      duration: parsed.data.duration,
      endedAt: parsed.data.endedAt ? new Date(parsed.data.endedAt) : null,
    },
  });

  return NextResponse.json({ ok: true }, { headers: corsHeaders() });
}
