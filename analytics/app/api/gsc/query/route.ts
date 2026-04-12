import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { auth } from '@/auth';
import { gscQuery, type QueryRequest } from '@/lib/gsc-query';
import { getUserTenantStatus } from '@/lib/user-tenant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const filterSchema = z.object({
  dimension: z.enum(['query', 'page', 'country', 'device']),
  operator: z.enum([
    'equals',
    'notEquals',
    'contains',
    'notContains',
    'includingRegex',
    'excludingRegex',
  ]),
  expression: z.string().min(1).max(500),
});

const requestSchema = z.object({
  siteId: z.string().min(1).max(100),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dimensions: z
    .array(
      z.enum(['date', 'query', 'page', 'country', 'device', 'searchAppearance']),
    )
    .max(5)
    .optional(),
  dimensionFilterGroups: z
    .array(
      z.object({
        groupType: z.literal('and'),
        filters: z.array(filterSchema).min(1).max(10),
      }),
    )
    .max(5)
    .optional(),
  type: z
    .enum(['web', 'image', 'video', 'news', 'discover', 'googleNews'])
    .optional(),
  rowLimit: z.number().int().min(1).max(25000).optional(),
  startRow: z.number().int().min(0).optional(),
  orderBy: z
    .enum(['clicks', 'impressions', 'ctr', 'position', 'date'])
    .optional(),
  orderDir: z.enum(['asc', 'desc']).optional(),
});

/**
 * POST /api/gsc/query
 * Body: QueryRequest (shape identique a l'API GSC searchAnalytics.query)
 *
 * Protege par session utilisateur (auth.js). Avant d'interroger GscDaily,
 * on verifie que le `siteId` du body appartient bien au tenant du user de
 * session (ou au tenant impersonne si le user est SUPERADMIN avec le
 * cookie d'impersonation actif). Un user sans droit sur ce siteId
 * recoit un 404 (pas 403 pour ne pas leak l'existence du site).
 *
 * Contrat isolation tenant :
 *   - User MEMBER : voit uniquement les sites de son tenant via membership
 *   - User SUPERADMIN sans cookie : pareil que MEMBER (voit son propre tenant)
 *   - User SUPERADMIN avec cookie `veridian_admin_as_tenant=<slug>` : voit
 *     les sites du tenant impersonne (resolu par slug via getUserTenantStatus)
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_payload', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Resolution du tenant du user (avec impersonation si SUPERADMIN + cookie).
  // On lit le cookie d'impersonation pour que Robert puisse voir la data
  // GSC d'un client qu'il consulte depuis /admin.
  const cookieStore = await cookies();
  const asTenantSlug = cookieStore.get('veridian_admin_as_tenant')?.value ?? null;
  const requesterRole =
    (session.user as { platformRole?: string }).platformRole ?? 'MEMBER';

  const status = await getUserTenantStatus(session.user.email, {
    asTenantSlug,
    requesterRole,
  });

  if (!status) {
    // Pas de tenant resolu → user orphelin ou tenant impersonne introuvable.
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Verification isolation : le siteId demande doit appartenir aux sites du
  // tenant resolu. 404 plutot que 403 pour ne pas confirmer l'existence du
  // site a un attaquant qui essaierait de lister les sites d'autres tenants.
  const authorizedSiteIds = new Set(status.sites.map((s) => s.id));
  if (!authorizedSiteIds.has(parsed.data.siteId)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  try {
    const res = await gscQuery(parsed.data as QueryRequest);
    return NextResponse.json(res);
  } catch (e) {
    // Log le detail cote serveur pour le debug, mais ne pas exposer
    // le message d'erreur au client (peut contenir des chemins, du SQL, etc.).
    console.error('[gsc/query] error:', e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: 'query_failed' },
      { status: 500 },
    );
  }
}
