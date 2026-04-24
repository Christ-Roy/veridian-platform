import type { Metadata } from 'next'
import Link from 'next/link'
import { Hammer, Phone, Mail } from 'lucide-react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Dupont BTP — Artisan de confiance',
  description: 'Travaux de maçonnerie, rénovation et extension. Devis gratuit.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/80 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 font-bold">
              <Hammer className="h-6 w-6 text-brand-600" />
              <span>Dupont BTP</span>
            </Link>
            <nav className="hidden items-center gap-8 text-sm font-medium md:flex">
              <Link href="/" className="hover:text-brand-600">Accueil</Link>
              <Link href="/services" className="hover:text-brand-600">Services</Link>
              <Link href="/contact" className="hover:text-brand-600">Contact</Link>
            </nav>
            <a
              href="tel:+33400000000"
              className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              <Phone className="h-4 w-4" /> Devis gratuit
            </a>
          </div>
        </header>
        <main>{children}</main>
        <footer className="mt-24 border-t border-neutral-200 bg-neutral-50">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-3">
            <div>
              <div className="flex items-center gap-2 font-bold">
                <Hammer className="h-5 w-5 text-brand-600" />
                Dupont BTP
              </div>
              <p className="mt-2 text-sm text-neutral-600">
                Artisan maçon depuis 1987 — interventions rapides sur tout le département.
              </p>
            </div>
            <div>
              <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-neutral-500">Contact</div>
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-brand-600" /> 04 00 00 00 00
              </div>
              <div className="mt-1 flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-brand-600" /> contact@dupont-btp.fr
              </div>
            </div>
            <div className="text-sm text-neutral-500 md:text-right">
              © {new Date().getFullYear()} Dupont BTP — Propulsé par Veridian
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}
