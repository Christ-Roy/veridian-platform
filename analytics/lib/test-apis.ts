import { NextResponse } from 'next/server';

/**
 * Helpers pour les routes /api/test/* : guard commun qui empeche ces routes
 * d'etre expose en prod.
 *
 * Regle de securite critique :
 *   - Les routes /api/test/* permettent de reset la DB, seeder du data, etc.
 *   - Elles ne doivent JAMAIS etre actives en prod.
 *   - Guard double :
 *       1. ENABLE_TEST_APIS doit valoir exactement 'true' (string)
 *       2. NODE_ENV ne doit PAS valoir 'production'
 *   - Si l'une des deux conditions n'est pas remplie, la route renvoie un
 *     404 neutre (pas 403) pour ne meme pas revaler l'existence de l'endpoint.
 *
 * Le workflow CI analytics met ENABLE_TEST_APIS=true dans le job e2e.
 * Le Dockerfile prod n'exporte jamais cette variable → production-safe.
 */
export function requireTestApisEnabled(): NextResponse | null {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (process.env.ENABLE_TEST_APIS !== 'true') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return null;
}
