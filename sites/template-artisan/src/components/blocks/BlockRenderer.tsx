import type { Block } from '@/lib/cms'
import { HeroBlock } from './HeroBlock'
import { ServicesBlock } from './ServicesBlock'
import { GalleryBlock } from './GalleryBlock'
import { TestimonialsBlock } from './TestimonialsBlock'
import { CTABlock } from './CTABlock'
import { RichTextBlock } from './RichTextBlock'
import { FormBlock } from './FormBlock'

export function BlockRenderer({ blocks }: { blocks?: Block[] }) {
  if (!blocks?.length) return null
  return (
    <>
      {blocks.map((b, i) => {
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
      })}
    </>
  )
}
