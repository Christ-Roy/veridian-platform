import Link from 'next/link'
import { Hammer, Phone } from 'lucide-react'
import type { HeaderDoc } from '@/lib/cms'
import { mediaUrl } from '@/lib/cms'

interface Props {
  header: HeaderDoc | null
  fallbackName: string
}

export function SiteHeader({ header, fallbackName }: Props) {
  const name = header?.logoText ?? fallbackName
  const logoSrc = mediaUrl(header?.logo ?? null, 'thumbnail')
  const nav = header?.nav?.length ? header.nav : [
    { label: 'Accueil', url: '/' },
    { label: 'Services', url: '/services' },
    { label: 'Contact', url: '/contact' },
  ]
  const cta = header?.cta?.label ? header.cta : { label: 'Devis gratuit', url: '/contact' }

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-bold">
          {logoSrc ? (
            <img src={logoSrc} alt={name} className="h-8 w-auto" />
          ) : (
            <Hammer className="h-6 w-6 text-brand-600" />
          )}
          <span>{name}</span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-medium md:flex">
          {nav.map((item) => (
            <Link key={item.url} href={item.url} className="hover:text-brand-600">
              {item.label}
            </Link>
          ))}
        </nav>
        {cta?.label && cta?.url && (
          <Link
            href={cta.url}
            className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Phone className="h-4 w-4" /> {cta.label}
          </Link>
        )}
      </div>
    </header>
  )
}
