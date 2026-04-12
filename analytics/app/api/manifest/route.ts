import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/manifest — Manifest PWA dynamique par tenant.
 *
 * Resolution du tenant :
 *   1. Query param ?tenant=<slug> (prioritaire — utilise par le <link> dans le layout)
 *   2. Fallback manifest generique Veridian si aucun tenant resolu
 *
 * Mode :
 *   - ?mode=client → manifest pour le SITE CLIENT (start_url=/, scope=/)
 *   - par defaut    → manifest pour le DASHBOARD Analytics (start_url=/dashboard)
 *
 * La route est publique (pas de session requise) pour que le navigateur
 * puisse charger le manifest avant le login.
 */
export async function GET(request: NextRequest) {
  const tenantSlug = request.nextUrl.searchParams.get('tenant');
  const mode = request.nextUrl.searchParams.get('mode'); // 'client' | null

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
        if (mode === 'client') {
          // Mode site client : le manifest est brande au nom du tenant
          // (pas "— Analytics", c'est l'app du client final)
          tenantName = tenant.name;
          shortName = tenant.name;
          description = tenant.name;
        } else {
          tenantName = `${tenant.name} — Analytics`;
          shortName = tenant.name;
          description = `Dashboard de performance — ${tenant.name}`;
        }
      }
    } catch {
      // Erreur DB → on sert le manifest generique, pas de crash
    }
  }

  // En mode client, le start_url et scope sont la racine du site client
  const startUrl = mode === 'client' ? '/' : '/dashboard';
  const scope = mode === 'client' ? '/' : undefined;

  const manifest: Record<string, unknown> = {
    name: tenantName,
    short_name: shortName,
    start_url: startUrl,
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

  if (scope) manifest.scope = scope;

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      // Cache 1h — le manifest ne change pas souvent et le navigateur
      // le re-fetch a chaque visite de toute facon
      'Cache-Control': 'public, max-age=3600',
      // CORS pour les sites clients qui chargent le manifest cross-origin
      'Access-Control-Allow-Origin': '*',
    },
  });
}
