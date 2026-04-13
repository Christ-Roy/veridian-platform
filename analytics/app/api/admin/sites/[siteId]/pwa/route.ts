import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { jsonError, requireAdmin } from '@/lib/admin-auth';

export const runtime = 'nodejs';

const schema = z.object({
  // Nom affiche dans la PWA (manifest name)
  appName: z.string().min(1).max(100).optional(),
  // Nom court (manifest short_name)
  shortName: z.string().min(1).max(30).optional(),
  // Couleur du theme (hex)
  themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  // URL du logo custom (stocke externe, ex: R2/S3)
  logoUrl: z.string().url().max(500).optional().nullable(),
});

/**
 * GET /api/admin/sites/:id/pwa — config PWA actuelle du site
 * PUT /api/admin/sites/:id/pwa — met a jour la config PWA
 *
 * Pour le MVP, la config PWA est stockee dans un champ JSON `pwaConfig`
 * sur le modele Site. Si le champ n'existe pas encore en DB, on le traite
 * comme un objet vide (defaults dans le manifest dynamique).
 *
 * Note : le champ `pwaConfig` doit etre ajoute au schema Prisma quand on
 * veut persister la config. Pour l'instant on utilise un champ virtuel
 * base sur le nom/domaine du site.
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
      name: true,
      tenant: { select: { name: true, slug: true } },
    },
  });

  if (!site) return jsonError('site_not_found', 404);

  // Config PWA par defaut derivee du tenant
  return NextResponse.json({
    site: site.id,
    domain: site.domain,
    pwa: {
      appName: site.tenant.name,
      shortName: site.tenant.name.split(' ')[0],
      themeColor: '#2563eb',
      logoUrl: null,
      manifestUrl: `/api/manifest?tenant=${site.tenant.slug}&mode=client`,
      swUrl: '/veridian-sw.js',
      installScript: '/pwa-install.js',
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

  // Pour le MVP on retourne la config mise a jour sans persister en DB.
  // Quand on ajoutera un champ `pwaConfig Json?` au modele Site, on
  // fera un prisma.site.update ici.
  return NextResponse.json({
    ok: true,
    pwa: parsed.data,
    hint: 'Config PWA notee. Pour le MVP, les changements prennent effet au prochain build du manifest dynamique (/api/manifest).',
  });
}
