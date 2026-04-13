import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { jsonError, requireAdmin } from '@/lib/admin-auth';
import {
  createMagicLink,
  sendMagicLinkEmail,
  type MagicLinkMetrics,
} from '@/lib/magic-link';
import { buildTenantStatus } from '@/lib/tenant-status';
import { computeScore, scoreLabel } from '@/lib/user-tenant';

export const runtime = 'nodejs';

const schema = z.object({
  // Email du destinataire. Si pas fourni, on prend l'owner du tenant.
  email: z.string().email().optional(),
  // Si true, genere le lien mais n'envoie PAS le mail (dry-run).
  dryRun: z.boolean().optional(),
});

/**
 * POST /api/admin/tenants/:id/magic-link
 *
 * Genere un magic link pour un tenant et optionnellement l'envoie par
 * mail via Brevo. Retourne toujours l'URL du lien (utile pour copier-
 * coller manuellement si l'envoi mail echoue ou si dryRun=true).
 *
 * Le mail inclut un apercu des metriques du tenant si disponibles.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const { tenantId } = await params;

  let body = {};
  try {
    body = await req.json();
  } catch {
    // body vide = defaults
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return jsonError('invalid_payload', 400, {
      issues: parsed.error.flatten(),
    });
  }

  // Resout le tenant
  const tenant = await prisma.tenant.findFirst({
    where: {
      OR: [{ id: tenantId }, { slug: tenantId }],
      deletedAt: null,
    },
    include: {
      memberships: {
        where: { role: { in: ['OWNER', 'ADMIN'] } },
        include: { user: { select: { id: true, email: true } } },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
      sites: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
        include: {
          gscProperty: {
            select: { propertyUrl: true, lastSyncAt: true },
          },
        },
      },
    },
  });

  if (!tenant) return jsonError('tenant_not_found', 404);

  // Email cible : explicit > owner > erreur
  const targetEmail =
    parsed.data.email || tenant.memberships[0]?.user?.email;
  if (!targetEmail) {
    return jsonError('no_email', 400, {
      hint: "Le tenant n'a pas d'owner avec un email. Passe l'email en body.",
    });
  }

  // Generer le magic link
  const { token, url, expiresAt } = await createMagicLink(targetEmail);

  // Charger les metriques pour le mail (optionnel, fail silencieux)
  let metrics: MagicLinkMetrics | undefined;
  try {
    const status = await buildTenantStatus(tenant as Parameters<typeof buildTenantStatus>[0]);
    let gscClicks = 0, pageviews = 0, formSubmissions = 0, sipCalls = 0;
    for (const s of status.sites) {
      gscClicks += s.counts28d.gscClicks;
      pageviews += s.counts28d.pageviews;
      formSubmissions += s.counts28d.formSubmissions;
      sipCalls += s.counts28d.sipCalls;
    }
    const scoreInfo = computeScore(
      status.sites.flatMap((s) => s.activeServices),
    );
    const label = scoreLabel(scoreInfo.score);
    metrics = {
      gscClicks,
      pageviews,
      formSubmissions,
      sipCalls,
      score: scoreInfo.score,
      scoreLabel: label.label,
    };
  } catch {
    // pas de metriques = mail simple
  }

  // Envoyer le mail (sauf dry-run)
  let emailSent = false;
  let emailError: string | undefined;
  if (!parsed.data.dryRun) {
    try {
      await sendMagicLinkEmail(targetEmail, url, tenant.name, metrics);
      emailSent = true;
    } catch (e) {
      emailError = e instanceof Error ? e.message : 'email_failed';
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun: parsed.data.dryRun || false,
    sentTo: targetEmail,
    emailSent,
    emailError,
    inviteUrl: url,
    expiresAt,
    token,
  });
}
