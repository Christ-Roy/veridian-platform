import { prisma } from '@/lib/prisma';
import { PerformanceDashboard } from '@/components/gsc/performance-dashboard';

export const dynamic = 'force-dynamic';

export default async function GscPage() {
  // Charge la liste des sites accessibles (tous pour le POC).
  let sites: Array<{
    id: string;
    domain: string;
    name: string;
    gscAttached: boolean;
  }> = [];
  let dbError: string | null = null;

  try {
    const raw = await prisma.site.findMany({
      where: { deletedAt: null },
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
