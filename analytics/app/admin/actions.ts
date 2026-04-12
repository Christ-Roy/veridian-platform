'use server';

// Server actions de la console /admin.
//
// Ces actions sont invoquees depuis la page /admin (formulaires ou boutons
// avec action). Chaque action verifie la session superadmin AVANT toute
// operation. Si le guard echoue, on throw — Next.js renvoie l'erreur au
// client et l'UI affiche un fallback.

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { requireSuperadmin } from '@/lib/admin-guard';
import { revalidatePath } from 'next/cache';
import crypto from 'node:crypto';

/**
 * Rotate le siteKey d'un site. Le nouveau token est genere cote server.
 * Invalide l'ancien immediatement — a utiliser si Robert pense qu'une
 * clef a fuite ou apres la mise en place du tracker chez un nouveau client.
 */
export async function rotateSiteKeyAction(siteId: string) {
  const session = await auth();
  requireSuperadmin(session);

  const newKey =
    'sk_' + crypto.randomBytes(24).toString('base64url').replace(/=/g, '');
  await prisma.site.update({
    where: { id: siteId, deletedAt: null },
    data: { siteKey: newKey },
  });
  revalidatePath('/admin');
  return { ok: true, newKey };
}

/**
 * Declenche une sync GSC pour un site. On appelle la route interne
 * /api/admin/gsc/sync (qui porte deja toute la logique batch +
 * deleteMany + createMany) en injectant la clef admin cote server.
 *
 * C'est volontairement un wrapper minimal : le vrai code de sync reste
 * dans la route handler, on ne veut pas le dupliquer. Le trade-off est
 * qu'on fait un round-trip HTTP local — en pratique c'est une milliseconde
 * et ca garde la logique sync centralisee a un seul endroit.
 */
export async function syncGscAction(siteId: string, days = 3) {
  const session = await auth();
  requireSuperadmin(session);

  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    return { ok: false, error: 'admin_api_key_not_set' as const };
  }

  // Resolution de l'origin pour l'appel local. En prod Next.js gere ca via
  // les headers de la requete, mais une server action n'en recoit pas
  // directement — on se rabat sur NEXTAUTH_URL ou localhost pour le dev.
  const origin =
    process.env.NEXTAUTH_URL ||
    process.env.PUBLIC_TRACKER_URL ||
    'http://127.0.0.1:3000';

  try {
    const res = await fetch(`${origin}/api/admin/gsc/sync`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-admin-key': adminKey,
      },
      body: JSON.stringify({ siteId, days, searchTypes: ['web'] }),
      // La route peut mettre plusieurs secondes — pas de timeout agressif.
      cache: 'no-store',
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        ok: false,
        error: `sync_failed_${res.status}`,
        details: text.slice(0, 200),
      } as const;
    }
    revalidatePath('/admin');
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'sync_failed',
    } as const;
  }
}

/**
 * Envoie une notification push a tous les abonnes d'un tenant.
 * Le vrai travail est fait par la route /api/admin/tenants/:id/push-notify
 * (creee par l'agent 2) — on ne duplique pas la logique ici.
 */
export async function sendPushNotifyAction(formData: FormData) {
  const session = await auth();
  requireSuperadmin(session);

  const tenantId = String(formData.get('tenantId') || '');
  const title = String(formData.get('title') || '');
  const body = String(formData.get('body') || '');
  const url = String(formData.get('url') || '');

  if (!tenantId || !title || !body) {
    return { ok: false, error: 'missing_fields' as const };
  }

  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    return { ok: false, error: 'admin_api_key_not_set' as const };
  }

  const origin =
    process.env.NEXTAUTH_URL ||
    process.env.PUBLIC_TRACKER_URL ||
    'http://127.0.0.1:3000';

  try {
    const res = await fetch(
      `${origin}/api/admin/tenants/${tenantId}/push-notify`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-key': adminKey,
        },
        body: JSON.stringify({ title, body, url: url || undefined }),
        cache: 'no-store',
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        ok: false,
        error: `push_failed_${res.status}`,
        details: text.slice(0, 200),
      } as const;
    }

    const data = await res.json().catch(() => ({}));
    revalidatePath('/admin');
    return {
      ok: true,
      sent: data.sent ?? 0,
      failed: data.failed ?? 0,
      cleaned: data.cleaned ?? 0,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'push_failed',
    } as const;
  }
}

/**
 * Envoie un magic link a l'owner d'un tenant pour qu'il accede a son
 * dashboard sans avoir a connaitre de password. Le token est stocke dans
 * VerificationToken (modele Auth.js natif). Le lien renvoie vers /welcome
 * qui valide le token et ouvre une session 9 mois.
 */
export async function sendMagicLinkAction(formData: FormData) {
  const session = await auth();
  requireSuperadmin(session);

  const tenantId = String(formData.get('tenantId') || '');
  if (!tenantId) return { ok: false, error: 'missing_tenant_id' as const };

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      memberships: {
        where: { role: { in: ['OWNER', 'ADMIN'] } },
        include: { user: true },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  });
  if (!tenant || tenant.memberships.length === 0) {
    return { ok: false, error: 'no_owner_found' as const };
  }
  const targetUser = tenant.memberships[0].user;

  // Import dynamique pour garder /admin leger.
  const { createMagicLink, sendMagicLinkEmail } = await import(
    '@/lib/magic-link'
  );
  const { buildTenantStatus } = await import('@/lib/tenant-status');
  const { computeScore, scoreLabel } = await import('@/lib/user-tenant');

  const { token, url } = await createMagicLink(targetUser.email);

  // On charge le status du tenant pour injecter les metriques dans le
  // mail. Le client voit un apercu de ses performances avant meme de
  // cliquer → suscite la curiosite, augmente le taux de clic.
  let metrics: import('@/lib/magic-link').MagicLinkMetrics | undefined;
  try {
    const fullTenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        memberships: {
          include: { user: { select: { id: true, email: true } } },
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
    if (fullTenant) {
      const status = await buildTenantStatus(fullTenant);
      // On agrege les counts de tous les sites du tenant.
      let gscClicks = 0, gscImpressions = 0, pageviews = 0,
        formSubmissions = 0, sipCalls = 0;
      for (const s of status.sites) {
        gscClicks += s.counts28d.gscClicks;
        gscImpressions += s.counts28d.gscImpressions;
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
        gscImpressions,
        pageviews,
        formSubmissions,
        sipCalls,
        score: scoreInfo.score,
        scoreLabel: label.label,
      };
    }
  } catch {
    // Si le fetch des metriques fail, on envoie quand meme le mail sans.
  }

  try {
    await sendMagicLinkEmail(targetUser.email, url, tenant.name, metrics);
    return { ok: true, sentTo: targetUser.email, token };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'email_failed',
    } as const;
  }
}
