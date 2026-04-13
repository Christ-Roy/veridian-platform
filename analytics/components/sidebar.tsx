'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  Phone,
  Search,
  Bell,
  LogOut,
  Lock,
  Shield,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
};

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/forms', label: 'Formulaires', icon: FileText },
  { href: '/dashboard/calls', label: 'Appels', icon: Phone },
  { href: '/dashboard/gsc', label: 'Search Console', icon: Search },
  { href: '/dashboard/push', label: 'Notifications', icon: Bell },
];

export function Sidebar({
  userEmail,
  signOutAction,
  lockedHrefs = [],
  isSuperadmin = false,
}: {
  userEmail?: string | null;
  signOutAction: () => Promise<void>;
  /**
   * Liste des hrefs de routes lockees (services inactifs pour le tenant).
   * Resolu cote server dans le layout via computeLockedHrefs(activeServices).
   * La sidebar se contente de l'afficher — elle ne recalcule rien.
   * Les items lockes sont affiches grises avec une icone lock en coin, mais
   * restent cliquables (le click mene a la page lockee qui affiche le CTA).
   */
  lockedHrefs?: string[];
  /** Affiche le lien /admin si le user est SUPERADMIN. */
  isSuperadmin?: boolean;
}) {
  const pathname = usePathname();
  const lockedSet = new Set(lockedHrefs);

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <div className="h-6 w-6 rounded bg-primary" />
        <span className="text-sm font-semibold">Veridian Analytics</span>
        <span className="ml-auto rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-black">
          BETA
        </span>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href);
          // La home /dashboard n'est jamais lockee, meme si lockedHrefs
          // contenait un truc loufoque. Garde-fou explicite.
          const locked = item.href !== '/dashboard' && lockedSet.has(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              data-testid={`nav-${item.href.split('/').filter(Boolean).join('-') || 'root'}`}
              data-locked={locked ? 'true' : 'false'}
              // Pas d'aria-disabled : le lien est volontairement cliquable
              // (il mene sur la page lockee qui affiche le CTA shadow marketing).
              // L'aspect "verrouille" est purement visuel (classes muted + lock icon).
              className={cn(
                'group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                // Style "verrouille" : opacite reduite + texte plus mute.
                // On garde hover subtil pour que le click reste engageant.
                locked &&
                  !active &&
                  'text-sidebar-foreground/40 hover:text-sidebar-foreground/60',
              )}
            >
              <Icon className={cn('h-4 w-4', locked && !active && 'opacity-60')} />
              <span className="flex-1">{item.label}</span>
              {locked && (
                <Lock
                  className="h-3 w-3 text-sidebar-foreground/40 group-hover:text-sidebar-foreground/60"
                  aria-hidden="true"
                />
              )}
            </Link>
          );
        })}
        {isSuperadmin && (
          <div className="mt-4 border-t border-sidebar-border pt-3">
            <Link
              href="/admin"
              data-testid="nav-admin"
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                pathname === '/admin'
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-amber-500/80 hover:bg-sidebar-accent hover:text-amber-500',
              )}
            >
              <Shield className="h-4 w-4" />
              <span className="flex-1">Admin</span>
            </Link>
          </div>
        )}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="mb-2 px-2 text-xs text-sidebar-foreground/60 truncate">
          {userEmail ?? '—'}
        </div>
        <Link
          href="/dashboard/settings"
          data-testid="nav-settings"
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors mb-1',
            pathname === '/dashboard/settings'
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          )}
        >
          <Settings className="h-4 w-4" />
          Paramètres
        </Link>
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="h-4 w-4" />
            Déconnexion
          </button>
        </form>
      </div>
    </aside>
  );
}
