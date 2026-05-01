import type { Block } from '@/lib/cms'
import { HeroBlock } from './HeroBlock'
import { ServicesBlock } from './ServicesBlock'
import { GalleryBlock } from './GalleryBlock'
import { TestimonialsBlock } from './TestimonialsBlock'
import { CTABlock } from './CTABlock'
import { RichTextBlock } from './RichTextBlock'
import { FormBlock } from './FormBlock'
import { EditOverlay } from '@/components/live-preview/EditOverlay'

export function BlockRenderer({
  blocks,
  previewMode = false,
  pageId,
}: {
  blocks?: Block[]
  /** Quand true, ajoute un overlay "Éditer" cliquable autour de chaque block. */
  previewMode?: boolean
  /** ID Payload de la page courante (pour deeplink admin block-N). */
  pageId?: number
}) {
  if (!blocks?.length) return null
  return (
    <>
      {blocks.map((b, i) => {
        const node = renderBlock(b, i)
        if (!node) return null
        if (!previewMode) return node
        return (
          <EditOverlay key={i} blockType={b.blockType} blockIndex={i} pageId={pageId}>
            {node}
          </EditOverlay>
        )
      })}
    </>
  )
}

function renderBlock(b: Block, i: number) {
  switch (b.blockType) {
    case 'hero': return <HeroBlock key={i} {...b} />
    case 'services': return <ServicesBlock key={i} {...b} />
    case 'gallery': return <GalleryBlock key={i} {...b} />
    case 'testimonials': return <TestimonialsBlock key={i} {...b} />
    case 'cta': return <CTABlock key={i} {...b} />
    case 'richtext': return <RichTextBlock key={i} {...b} />
    case 'formBlock': return <FormBlock key={i} {...b} />
    default: return null
  }
}
