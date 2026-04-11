import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { corsHeaders, resolveSiteKey } from '@/lib/ingest';

export const runtime = 'nodejs';

const schema = z.object({
  formName: z.string().min(1).max(100),
  path: z.string().max(500).optional().nullable(),
  payload: z.record(z.unknown()).default({}),
  email: z.string().email().max(200).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  utmSource: z.string().max(100).optional().nullable(),
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

  // Extraire email/phone du payload s'ils n'ont pas été passés explicitement.
  const p = parsed.data.payload as Record<string, unknown>;
  const email =
    parsed.data.email ??
    (typeof p.email === 'string' ? p.email : null) ??
    null;
  const phone =
    parsed.data.phone ??
    (typeof p.phone === 'string'
      ? p.phone
      : typeof p.tel === 'string'
        ? p.tel
        : typeof p.telephone === 'string'
          ? p.telephone
          : null) ??
    null;

  const submission = await prisma.formSubmission.create({
    data: {
      siteId: site.siteId,
      formName: parsed.data.formName,
      path: parsed.data.path ?? null,
      payload: parsed.data.payload as object,
      email,
      phone,
      utmSource: parsed.data.utmSource ?? null,
    },
    select: { id: true, createdAt: true },
  });

  return NextResponse.json(
    { ok: true, id: submission.id },
    { headers: corsHeaders() },
  );
}
