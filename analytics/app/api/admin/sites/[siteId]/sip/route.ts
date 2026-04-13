import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { jsonError, requireAdmin } from '@/lib/admin-auth';

export const runtime = 'nodejs';

const schema = z.object({
  // Numero de telephone dedie pour le call tracking (format E.164)
  phoneNumber: z.string().regex(/^\+\d{10,15}$/).optional().nullable(),
  // Fournisseur SIP (ovh ou telnyx)
  provider: z.enum(['ovh', 'telnyx']).optional(),
  // Activer/desactiver le call tracking
  enabled: z.boolean().optional(),
});

/**
 * GET /api/admin/sites/:id/sip — config SIP/call tracking actuelle
 * PUT /api/admin/sites/:id/sip — configure le call tracking
 *
 * Pour le MVP, la config SIP est un placeholder — on retourne la config
 * prevue et le endpoint est pret a etre branche sur OVH ou Telnyx quand
 * le call tracking sera active. Le champ sera persiste dans un modele
 * SipConfig ou dans un champ JSON sur Site.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const { siteId } = await params;
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: {
      id: true,
      domain: true,
      _count: { select: { sipCalls: true } },
    },
  });

  if (!site) return jsonError('site_not_found', 404);

  return NextResponse.json({
    site: site.id,
    domain: site.domain,
    sip: {
      enabled: false,
      phoneNumber: null,
      provider: null,
      callsCount: site._count.sipCalls,
      ingestEndpoint: '/api/ingest/call',
      hint: 'Le call tracking SIP sera branche via OVH voiceConsumption ou Telnyx Call Control. Contactez contact@veridian.site pour activer.',
    },
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const { siteId } = await params;
  let body;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_json');
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_payload', 400, {
      issues: parsed.error.flatten(),
    });
  }

  // Placeholder : on retourne la config souhaitee. Quand le SIP sera
  // branche, on persistera dans un modele SipConfig.
  return NextResponse.json({
    ok: true,
    sip: parsed.data,
    hint: 'Config SIP enregistree (placeholder MVP). Le branchement reel sera fait dans une session dediee.',
  });
}
