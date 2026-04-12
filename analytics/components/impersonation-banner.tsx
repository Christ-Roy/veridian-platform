import Link from 'next/link';
import { ShieldAlert, X } from 'lucide-react';

/**
 * Bandeau affiche quand un superadmin consulte /dashboard?asTenant=<slug>
 * pour un tenant qui n'est pas le sien. Rappelle que la vue est falsifiee
 * et permet de quitter l'impersonation en un click.
 */
export function ImpersonationBanner({
  tenantName,
  tenantSlug,
}: {
  tenantName: string;
  tenantSlug: string;
}) {
  return (
    <div
      className="mb-4 flex items-center gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm"
      data-testid="impersonation-banner"
      data-tenant-slug={tenantSlug}
    >
      <ShieldAlert className="h-4 w-4 text-amber-400" aria-hidden />
      <div className="flex-1 text-amber-200">
        <span className="font-semibold">Mode admin</span>
        <span className="text-amber-200/70">
          {' — vous consultez le dashboard de '}
        </span>
        <span className="font-semibold">{tenantName}</span>
      </div>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 px-2 py-1 text-xs text-amber-200 hover:bg-amber-500/20"
        data-testid="exit-impersonation"
      >
        <X className="h-3 w-3" />
        Quitter
      </Link>
    </div>
  );
}
