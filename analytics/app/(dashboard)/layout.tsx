import { auth, signOut } from '@/auth';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { Sidebar } from '@/components/sidebar';
import {
  getUserTenantStatus,
  aggregateActiveServices,
  computeLockedHrefs,
} from '@/lib/user-tenant';
import { isSuperadmin } from '@/lib/admin-guard';

// Force-dynamic sur le layout : les services actifs (et donc la liste des
// hrefs lockees dans la sidebar) peuvent changer a chaque provisioning via
// le skill admin. On ne veut aucun cache static ici.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.email) {
    redirect('/login');
  }

  // Impersonation superadmin : on lit le cookie `veridian_admin_as_tenant`
  // pose par la page /admin quand Robert clique "Ouvrir le dashboard client".
  // Le cookie est plus fiable qu'un query param car il persiste en naviguant
  // entre les pages du dashboard (les query params se perdent en Next 15
  // client-side navigation). Fallback sur le query param ?asTenant via le
  // header middleware x-pathname-url pour retrocompat.
  const { cookies } = await import('next/headers');
  const cookieJar = await cookies();
  let asTenantSlug = cookieJar.get('veridian_admin_as_tenant')?.value || null;

  // Fallback query param si pas de cookie
  if (!asTenantSlug) {
    const hdrs = await headers();
    const urlHeader = hdrs.get('x-pathname-url') || '';
    try {
      if (urlHeader) {
        const url = new URL(urlHeader, 'http://placeholder');
        asTenantSlug = url.searchParams.get('asTenant');
      }
    } catch { /* noop */ }
  }

  const canImpersonate = Boolean(asTenantSlug) && isSuperadmin(session);

  // On resout le tenant + l'agregation des services actifs ici pour que la
  // sidebar ait l'info de lock disponible sur TOUTES les pages dashboard
  // sans avoir a la refetcher page par page. Tolerant aux erreurs DB : en
  // cas de soucis on considere toutes les routes comme lockees (safer).
  let lockedHrefs: string[] = [];
  try {
    const status = await getUserTenantStatus(session.user.email, {
      asTenantSlug: canImpersonate ? asTenantSlug : null,
      requesterRole: (session.user as { platformRole?: string }).platformRole || null,
    });
    const active = aggregateActiveServices(status);
    lockedHrefs = computeLockedHrefs(active);
  } catch {
    lockedHrefs = computeLockedHrefs(null);
  }

  async function signOutAction() {
    'use server';
    await signOut({ redirectTo: '/login' });
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        userEmail={session.user.email}
        signOutAction={signOutAction}
        lockedHrefs={lockedHrefs}
        isSuperadmin={isSuperadmin(session)}
      />
      <main className="flex-1 overflow-y-auto">
        {/* Bandeau d'impersonation visible quand Robert consulte un autre tenant */}
        {canImpersonate && asTenantSlug && (
          <div className="flex items-center justify-between bg-amber-500 px-4 py-2 text-sm font-medium text-black">
            <span>
              Mode admin — Vous consultez le tenant{' '}
              <span className="font-mono font-bold">{asTenantSlug}</span>
            </span>
            <form
              action={async () => {
                'use server';
                const { cookies } = await import('next/headers');
                const { redirect } = await import('next/navigation');
                const jar = await cookies();
                jar.delete('veridian_admin_as_tenant');
                redirect('/admin');
              }}
            >
              <button
                type="submit"
                className="rounded bg-black/20 px-3 py-1 text-xs font-semibold hover:bg-black/30"
              >
                Quitter le mode admin
              </button>
            </form>
          </div>
        )}
        <div className="mx-auto max-w-6xl p-8">{children}</div>
      </main>
    </div>
  );
}
