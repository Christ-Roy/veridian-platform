import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Demo CMS Veridian',
  description: 'Site vitrine de démonstration branché sur Payload CMS multi-tenant',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
