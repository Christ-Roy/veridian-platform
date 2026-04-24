import type { Metadata } from 'next'
import { getHeader, getFooter } from '@/lib/cms'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { SiteFooter } from '@/components/layout/SiteFooter'
import './globals.css'

export const metadata: Metadata = {
  title: 'Dupont BTP — Artisan de confiance',
  description: 'Travaux de maçonnerie, rénovation et extension. Devis gratuit.',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [header, footer] = await Promise.all([getHeader(), getFooter()])
  return (
    <html lang="fr">
      <body>
        <SiteHeader header={header} fallbackName="Dupont BTP" />
        <main>{children}</main>
        <SiteFooter footer={footer} fallbackName="Dupont BTP" />
      </body>
    </html>
  )
}
