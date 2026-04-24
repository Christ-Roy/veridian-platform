import type { Metadata } from 'next'
import Link from 'next/link'
import { UtensilsCrossed, Phone, MapPin } from 'lucide-react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Le Bistro d\'Alice — Cuisine française',
  description: 'Restaurant gastronomique au cœur de Lyon. Produits frais, cuisine de saison.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <header className="sticky top-0 z-40 border-b border-neutral-200 bg-cream/90 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 font-serif text-xl font-bold">
              <UtensilsCrossed className="h-5 w-5 text-brand-600" />
              <span>Le Bistro d&apos;Alice</span>
            </Link>
            <nav className="hidden items-center gap-8 text-sm font-medium md:flex">
              <Link href="/" className="hover:text-brand-600">Accueil</Link>
              <Link href="/menu" className="hover:text-brand-600">Menu</Link>
              <Link href="/contact" className="hover:text-brand-600">Réserver</Link>
            </nav>
            <a
              href="tel:+33400000000"
              className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              <Phone className="h-4 w-4" /> Réserver
            </a>
          </div>
        </header>
        <main>{children}</main>
        <footer className="mt-24 border-t border-neutral-200 bg-white">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-3">
            <div>
              <div className="flex items-center gap-2 font-serif text-lg font-bold">
                <UtensilsCrossed className="h-5 w-5 text-brand-600" />
                Le Bistro d&apos;Alice
              </div>
              <p className="mt-2 text-sm text-neutral-600 italic">
                « La cuisine, c&apos;est quand les choses ont le goût de ce qu&apos;elles sont. »
              </p>
            </div>
            <div>
              <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-neutral-500">Contact</div>
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-brand-600" /> 04 00 00 00 00
              </div>
              <div className="mt-1 flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-brand-600" /> 15 rue Mercière, Lyon
              </div>
            </div>
            <div className="text-sm text-neutral-500 md:text-right">
              © {new Date().getFullYear()} Le Bistro d&apos;Alice
              <br />
              <span className="text-xs">Propulsé par Veridian</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}
