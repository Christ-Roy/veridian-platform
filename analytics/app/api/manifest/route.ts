import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/manifest — Manifest PWA dynamique par tenant.
 *
 * Resolution du tenant :
 *   1. Query param ?tenant=<slug> (prioritaire — utilise par le <link> dans le layout)
 *   2. Fallback manifest generique Veridian si aucun tenant resolu
 *
 * La route est publique (pas de session requise) pour que le navigateur
 * puisse charger le manifest avant le login.
 */
export async function GET(request: NextRequest) {
  const tenantSlug = request.nextUrl.searchParams.get('tenant');

  let tenantName = 'Veridian Analytics';
  let shortName = 'Veridian';
  let description = 'Dashboard de performance — Veridian';

  if (tenantSlug) {
    try {
      const tenant = await prisma.tenant.findUnique({
        where: { slug: tenantSlug },
        select: { name: true, slug: true },
      });

      if (tenant) {
        tenantName = `${tenant.name} — Analytics`;
        shortName = tenant.name;
        description = `Dashboard de performance — ${tenant.name}`;
      }
    } catch {
      // Erreur DB → on sert le manifest generique, pas de crash
    }
  }

  const manifest = {
    name: tenantName,
    short_name: shortName,
    start_url: '/dashboard',
    display: 'standalone',
    theme_color: '#2563eb',
    background_color: '#ffffff',
    description,
    icons: [
      {
        src: '/icons/icon-192.svg',
        sizes: '192x192',
        type: 'image/svg+xml',
        purpose: 'any maskable',
      },
      {
        src: '/icons/icon-512.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'any maskable',
      },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      // Cache 1h — le manifest ne change pas souvent et le navigateur
      // le re-fetch a chaque visite de toute facon
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
