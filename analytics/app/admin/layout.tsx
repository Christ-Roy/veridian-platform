import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { isSuperadmin } from '@/lib/admin-guard';
import Link from 'next/link';
import { Shield, ArrowLeft } from 'lucide-react';

// Force-dynamic : on ne veut jamais de cache Next sur la console admin,
// l'etat des tenants change a la volee pendant le provisioning.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Layout de la console /admin (Robert-only).
 * Guard session au premier niveau : si pas superadmin, redirect.
 * Bandeau visible "Mode admin — console plateforme" pour que Robert ne se
 * perde pas entre sa vue client et sa vue plateforme.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.email) {
    redirect('/login?callbackUrl=/admin');
  }
  if (!isSuperadmin(session)) {
    // User loggue mais pas superadmin : retour au dashboard client.
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Bandeau admin permanent — distinct visuellement du dashboard client */}
      <header
        className="sticky top-0 z-10 border-b border-amber-500/30 bg-amber-500/10 backdrop-blur"
        data-testid="admin-banner"
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-3">
          <Shield className="h-4 w-4 text-amber-400" aria-hidden />
          <div className="flex-1 text-sm">
            <span className="font-semibold text-amber-200">Mode admin</span>
            <span className="text-amber-200/70">
              {' — console plateforme Veridian Analytics'}
            </span>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 px-2 py-1 text-xs text-amber-200 hover:bg-amber-500/20"
          >
            <ArrowLeft className="h-3 w-3" />
            Mon dashboard
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-8">{children}</main>
    </div>
  );
}
