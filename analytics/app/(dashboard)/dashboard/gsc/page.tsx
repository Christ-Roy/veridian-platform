import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PerformanceDashboard } from '@/components/gsc/performance-dashboard';
import { auth } from '@/auth';
import {
  getUserTenantStatus,
  aggregateActiveServices,
  isServiceActive,
} from '@/lib/user-tenant';
import { LockedServicePage } from '@/components/locked-service-page';

// Deja force-dynamic avant la phase 2 — on garde, plus revalidate=0 pour
// etre explicite et coherent avec les autres pages guardees.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function GscPage() {
  // Guard service : si GSC n'est pas actif pour le tenant du user, on
  // affiche l'ecran "verrouille" au lieu du clone GSC. Des qu'une propriete
  // est attachee + sync, la page s'unlock automatiquement au reload.
  const session = await auth();
  if (!session?.user?.email) {
    redirect('/login');
  }

  const { cookies } = await import('next/headers');
  const cookieJar = await cookies();
  const asTenant = cookieJar.get('veridian_admin_as_tenant')?.value || null;
  const platformRole = (session.user as { platformRole?: string }).platformRole || null;
  const status = await getUserTenantStatus(session.user.email, {
    asTenantSlug: asTenant,
    requesterRole: platformRole,
  });
  const active = aggregateActiveServices(status);
  // Narrowing : si status est null, active est [] donc le guard trigger.
  // Le check explicite `!status` permet a TS de narrow pour la query plus bas.
  if (!status || !isServiceActive(active, 'gsc')) {
    const domain = status?.sites[0]?.domain ?? '';
    return <LockedServicePage service="gsc" siteDomain={domain} />;
  }

  // Charge la liste des sites accessibles — isole par tenantId pour ne pas
  // fuiter les sites des autres tenants dans le selector GSC.
  let sites: Array<{
    id: string;
    domain: string;
    name: string;
    gscAttached: boolean;
  }> = [];
  let dbError: string | null = null;

  try {
    const raw = await prisma.site.findMany({
      where: { tenantId: status.tenant.id, deletedAt: null },
      include: { gscProperty: { select: { id: true } } },
      orderBy: { createdAt: 'desc' },
    });
    sites = raw.map((s) => ({
      id: s.id,
      domain: s.domain,
      name: s.name,
      gscAttached: !!s.gscProperty,
    }));
  } catch (e) {
    dbError = e instanceof Error ? e.message : 'DB error';
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Google Search Console</h1>
        <p className="text-sm text-muted-foreground">
          Performance de recherche — clone 1:1 de l&apos;interface GSC, powered
          by tes data.
        </p>
      </div>

      {dbError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {dbError}
        </div>
      )}

      <PerformanceDashboard sites={sites} />
    </div>
  );
}
