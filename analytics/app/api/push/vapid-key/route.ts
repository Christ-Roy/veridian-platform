import { NextResponse } from 'next/server';
import { getVapidPublicKey } from '@/lib/web-push';

export const runtime = 'nodejs';

// Public — le browser a besoin de la cle VAPID avant le subscribe.
// Pas de session requise.
export async function GET() {
  return NextResponse.json({ publicKey: getVapidPublicKey() });
}
