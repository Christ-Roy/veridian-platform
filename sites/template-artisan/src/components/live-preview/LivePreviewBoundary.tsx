'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useLivePreview } from '@payloadcms/live-preview-react'
import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import type { Block, PageDoc } from '@/lib/cms'

const CMS_URL = process.env.NEXT_PUBLIC_CMS_API_URL || 'https://cms.staging.veridian.site'

/**
 * Wrapper "preview-aware" autour des pages.
 *
 * Comportement :
 *  - En production normale (sans `?preview=1`) → rend le SSG inchangé (children).
 *  - En `?preview=1` (iframe Payload) → écoute les `postMessage` de l'admin
 *    et re-render les blocks avec les données live (sans rebuild).
 *
 * Compatible `output: 'export'` : le composant est lazy côté client, n'impacte
 * pas le SSG, et n'ajoute aucune route dynamique.
 */
export function LivePreviewBoundary({
  children,
  initialPage,
  fallbackBlocks,
}: {
  children: ReactNode
  initialPage: PageDoc | null
  fallbackBlocks: Block[]
}) {
  const [isPreview, setIsPreview] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setIsPreview(params.get('preview') === '1')
  }, [])

  if (!isPreview) {
    return <>{children}</>
  }

  return (
    <PreviewRenderer initialPage={initialPage} fallbackBlocks={fallbackBlocks} />
  )
}

function PreviewRenderer({
  initialPage,
  fallbackBlocks,
}: {
  initialPage: PageDoc | null
  fallbackBlocks: Block[]
}) {
  // Le hook Payload écoute window.postMessage et hydrate `data` avec les
  // dernières valeurs depuis l'admin (debounce 250ms par défaut).
  const { data } = useLivePreview<PageDoc>({
    initialData: (initialPage ?? { blocks: fallbackBlocks }) as PageDoc,
    serverURL: CMS_URL,
    depth: 2,
  })

  const blocks = data?.blocks?.length ? data.blocks : fallbackBlocks

  return (
    <>
      <PreviewBadge />
      <BlockRenderer blocks={blocks} previewMode pageId={data?.id ?? initialPage?.id} />
    </>
  )
}

/**
 * Badge fixé en haut pour indiquer le mode preview actif.
 */
function PreviewBadge() {
  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        right: 12,
        zIndex: 9999,
        background: '#1a3d2f',
        color: '#86efac',
        padding: '6px 12px',
        borderRadius: 8,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        boxShadow: '0 4px 12px rgba(26, 61, 47, 0.25)',
        pointerEvents: 'none',
      }}
    >
      ● Aperçu en direct
    </div>
  )
}
