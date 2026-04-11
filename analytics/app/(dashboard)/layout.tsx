import { auth, signOut } from '@/auth';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import {
  getUserTenantStatus,
  aggregateActiveServices,
  computeLockedHrefs,
} from '@/lib/user-tenant';

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

  // On resout le tenant + l'agregation des services actifs ici pour que la
  // sidebar ait l'info de lock disponible sur TOUTES les pages dashboard
  // sans avoir a la refetcher page par page. Tolerant aux erreurs DB : en
  // cas de soucis on considere toutes les routes comme lockees (safer).
  let lockedHrefs: string[] = [];
  try {
    const status = await getUserTenantStatus(session.user.email);
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
