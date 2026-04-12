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

  // Lecture de ?asTenant=<slug> pour l'impersonation superadmin. Next 15 ne
  // passe PAS searchParams au layout, on lit via le header injecte par le
  // middleware (`x-pathname-url`). Fallback : rien, ce qui est safe (le
  // layout tombe sur le tenant du user, meme en mode impersonation —
  // l'impersonation affectera la page elle-meme via searchParams).
  const hdrs = await headers();
  const urlHeader = hdrs.get('x-pathname-url') || '';
  let asTenantSlug: string | null = null;
  try {
    if (urlHeader) {
      const url = new URL(urlHeader, 'http://placeholder');
      asTenantSlug = url.searchParams.get('asTenant');
    }
  } catch {
    asTenantSlug = null;
  }
  const role = (session.user as { role?: string }).role;
  const canImpersonate = Boolean(asTenantSlug) && isSuperadmin(session);

  // On resout le tenant + l'agregation des services actifs ici pour que la
  // sidebar ait l'info de lock disponible sur TOUTES les pages dashboard
  // sans avoir a la refetcher page par page. Tolerant aux erreurs DB : en
  // cas de soucis on considere toutes les routes comme lockees (safer).
  let lockedHrefs: string[] = [];
  try {
    const status = await getUserTenantStatus(session.user.email, {
      asTenantSlug: canImpersonate ? asTenantSlug : null,
      requesterRole: role,
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
      />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl p-8">{children}</div>
      </main>
    </div>
  );
}
