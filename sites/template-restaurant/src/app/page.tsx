import { getPage } from '@/lib/cms'
import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { HOME } from '@/content/home'

export const dynamic = 'force-static'

export default async function Home() {
  const page = await getPage('home')
  const blocks = page?.blocks?.length ? page.blocks : HOME
  return <BlockRenderer blocks={blocks} />
}

export async function generateMetadata() {
  const page = await getPage('home')
  return {
    title: page?.seo?.metaTitle ?? page?.title ?? "Le Bistro d'Alice — Cuisine française",
    description:
      page?.seo?.metaDescription ??
      'Restaurant gastronomique au cœur de Lyon. Produits frais, cuisine de saison.',
  }
}
