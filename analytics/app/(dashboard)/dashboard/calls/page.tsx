import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { prisma } from '@/lib/prisma';

export default async function CallsPage() {
  let calls: Awaited<ReturnType<typeof prisma.sipCall.findMany>> = [];
  let dbError: string | null = null;
  try {
    calls = await prisma.sipCall.findMany({
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
          Call tracking — appels entrants et sortants sur les numéros Veridian.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Intégration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Les logs d&apos;appels sont poussés par le webhook OVH/Telnyx vers :
          </p>
          <pre className="overflow-x-auto rounded bg-muted p-3 text-xs text-foreground">
{`POST /api/ingest/call
Headers: x-site-key: <ton_site_key>
Body: { "callId": "...", "fromNum": "+33...", "toNum": "+33...",
         "direction": "inbound", "status": "answered",
         "duration": 120, "startedAt": "2026-04-11T10:00:00Z" }`}
          </pre>
        </CardContent>
      </Card>

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
                      <td className="py-2">{c.direction}</td>
                      <td className="py-2">{c.status}</td>
                      <td className="py-2 tabular-nums">{c.duration}s</td>
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
