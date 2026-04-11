import { prisma } from '@/lib/prisma';

/**
 * Résout un siteKey (header x-site-key) vers l'id du Site correspondant.
 * Retourne null si pas trouvé — les handlers doivent renvoyer 401.
 */
export async function resolveSiteKey(
  req: Request,
): Promise<{ siteId: string; tenantId: string } | null> {
  const key = req.headers.get('x-site-key');
  if (!key) return null;
  const site = await prisma.site.findUnique({
    where: { siteKey: key },
    select: { id: true, tenantId: true, deletedAt: true },
  });
  if (!site || site.deletedAt) return null;
  return { siteId: site.id, tenantId: site.tenantId };
}

export function corsHeaders(): HeadersInit {
  // POC : on ouvre grand pour que les sites clients puissent POST depuis le browser.
  // TODO prod : whitelister les origins via la table Site.
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-site-key',
    'Access-Control-Max-Age': '86400',
  };
}
