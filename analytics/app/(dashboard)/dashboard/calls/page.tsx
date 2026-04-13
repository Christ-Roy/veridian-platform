import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import {
  getUserTenantStatus,
  aggregateActiveServices,
  isServiceActive,
} from '@/lib/user-tenant';
import { LockedServicePage } from '@/components/locked-service-page';

// Force-dynamic : le call tracking peut etre active n'importe quand cote
// skill admin, et le user doit voir la page s'unlock au reload.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CallsPage() {
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
  if (!status || !isServiceActive(active, 'calls')) {
    const domain = status?.sites[0]?.domain ?? '';
    return <LockedServicePage service="calls" siteDomain={domain} />;
  }

  let calls: Awaited<ReturnType<typeof prisma.sipCall.findMany>> = [];
  let dbError: string | null = null;
  try {
    // Isolation tenant : filtre par la relation site.tenantId.
    calls = await prisma.sipCall.findMany({
      where: { site: { tenantId: status.tenant.id } },
      orderBy: { startedAt: 'desc' },
      take: 50,
      include: { site: true },
    });
  } catch (e) {
    dbError = e instanceof Error ? e.message : 'DB error';
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Appels</h1>
        <p className="text-sm text-muted-foreground">
          {calls.length > 0
            ? `${calls.length} appel${calls.length > 1 ? 's' : ''} (50 derniers)`
            : 'Aucun appel enregistre. Configurez le call tracking pour commencer.'}
        </p>
      </div>

      {calls.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Integration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Les logs d&apos;appels sont poussés par le webhook OVH/Telnyx vers
              l&apos;API d&apos;ingestion.
            </p>
          </CardContent>
        </Card>
      )}

      {dbError && (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">
            {dbError}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Derniers appels</CardTitle>
        </CardHeader>
        <CardContent>
          {calls.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun appel enregistré.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="pb-2">Début</th>
                    <th className="pb-2">De</th>
                    <th className="pb-2">Vers</th>
                    <th className="pb-2">Direction</th>
                    <th className="pb-2">Statut</th>
                    <th className="pb-2">Durée</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.map((c) => (
                    <tr key={c.id} className="border-t border-border">
                      <td className="py-2 tabular-nums text-muted-foreground">
                        {new Date(c.startedAt).toLocaleString('fr-FR')}
                      </td>
                      <td className="py-2 tabular-nums">{c.fromNum}</td>
                      <td className="py-2 tabular-nums">{c.toNum}</td>
                      <td className="py-2">
                        <span className={c.direction === 'inbound' ? 'text-emerald-500' : 'text-blue-500'}>
                          {c.direction === 'inbound' ? '↙ Entrant' : '↗ Sortant'}
                        </span>
                      </td>
                      <td className="py-2">
                        <span className={
                          c.status === 'answered' ? 'rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-500' :
                          c.status === 'missed' ? 'rounded bg-rose-500/10 px-1.5 py-0.5 text-xs text-rose-500' :
                          'rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-500'
                        }>
                          {c.status === 'answered' ? 'Repondu' : c.status === 'missed' ? 'Manque' : 'Messagerie'}
                        </span>
                      </td>
                      <td className="py-2 tabular-nums">
                        {Math.floor(c.duration / 60)}:{String(c.duration % 60).padStart(2, '0')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
