import { getPage } from '@/lib/cms'
import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { HOME } from '@/content/home'

export const dynamic = 'force-static'

export default async function Home() {
  const page = await getPage('home')
  // Si CMS fournit des blocs → utilise-les. Sinon → contenu du code.
  const blocks = page?.blocks?.length ? page.blocks : HOME
  return <BlockRenderer blocks={blocks} />
}

export async function generateMetadata() {
  const page = await getPage('home')
  return {
    title: page?.seo?.metaTitle ?? page?.title ?? 'Dupont BTP — Artisan maçon à Lyon',
    description:
      page?.seo?.metaDescription ??
      "35 ans d'expérience en maçonnerie, rénovation et extension. Devis gratuit.",
  }
}
