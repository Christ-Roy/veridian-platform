import { getPage } from '@/lib/cms'
import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { CONTACT } from '@/content/contact'

export const dynamic = 'force-static'

export default async function ContactPage() {
  const page = await getPage('contact')
  const blocks = page?.blocks?.length ? page.blocks : CONTACT
  return <BlockRenderer blocks={blocks} />
}

export async function generateMetadata() {
  const page = await getPage('contact')
  return {
    title: page?.meta?.title ?? 'Contact — Dupont BTP',
    description: page?.meta?.description ?? 'Contactez Dupont BTP : 04 00 00 00 00, contact@dupont-btp.fr. Devis gratuit sous 48h.',
  }
}
