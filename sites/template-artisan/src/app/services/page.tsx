import { getPage } from '@/lib/cms'
import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import { LivePreviewBoundary } from '@/components/live-preview/LivePreviewBoundary'
import { SERVICES } from '@/content/services'

export const dynamic = 'force-static'

export default async function ServicesPage() {
  const page = await getPage('services')
  const blocks = page?.blocks?.length ? page.blocks : SERVICES
  return (
    <LivePreviewBoundary initialPage={page} fallbackBlocks={SERVICES}>
      <BlockRenderer blocks={blocks} />
    </LivePreviewBoundary>
  )
}

export async function generateMetadata() {
  const page = await getPage('services')
  return {
    title: page?.meta?.title ?? 'Services — Dupont BTP',
    description:
      page?.meta?.description ??
      'Maçonnerie, rénovation, extension, enduits, aménagement extérieur. 35 ans d\'expérience.',
  }
}
