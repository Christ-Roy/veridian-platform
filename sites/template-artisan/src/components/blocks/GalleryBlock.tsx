import { mediaUrl } from '@/lib/cms'

interface GalleryProps {
  title?: string | null
  subtitle?: string | null
  images: Array<{ image: { url?: string; alt?: string; sizes?: Record<string, { url?: string }> } | null; caption?: string | null }>
}

export function GalleryBlock({ title, subtitle, images }: GalleryProps) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20">
      {title && <h2 className="text-3xl font-bold">{title}</h2>}
      {subtitle && <p className="mt-2 text-neutral-600">{subtitle}</p>}
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {images.map((img, i) => {
          const url = mediaUrl(img.image, 'card')
          if (!url) return null
          return (
            <figure key={i} className="overflow-hidden rounded-lg">
              <img src={url} alt={img.image?.alt ?? ''} className="h-64 w-full object-cover" />
              {img.caption && <figcaption className="mt-2 text-sm text-neutral-600">{img.caption}</figcaption>}
            </figure>
          )
        })}
      </div>
    </section>
  )
}
