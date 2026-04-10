// Health check endpoint — format standard docs/saas-standards.md
// Retourne 200 si l'app repond et que la DB est accessible.
// Retourne 503 si la DB est injoignable.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VERSION = process.env.NEXT_PUBLIC_APP_VERSION || 'dev';

export async function GET() {
  const started = Date.now();
  let dbStatus: 'ok' | 'ko' = 'ok';

  try {
    if (process.env.DATABASE_URL) {
      await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => setTimeout(() => reject(new Error('db timeout')), 2000)),
      ]);
    } else {
      dbStatus = 'ko';
    }
  } catch {
    dbStatus = 'ko';
  }

  const status = dbStatus === 'ok' ? 'ok' : 'degraded';
  const httpStatus = dbStatus === 'ok' ? 200 : 503;

  return NextResponse.json(
    {
      status,
      version: VERSION,
      service: 'analytics',
      db: dbStatus,
      timestamp: new Date().toISOString(),
      latency_ms: Date.now() - started,
    },
    { status: httpStatus },
  );
}
