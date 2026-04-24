import { mediaUrl } from '@/lib/cms'

interface TestimonialsProps {
  title?: string | null
  items: Array<{
    quote: string
    author: string
    role?: string | null
    avatar?: { url?: string; alt?: string; sizes?: Record<string, { url?: string }> } | null
  }>
}

export function TestimonialsBlock({ title, items }: TestimonialsProps) {
  return (
    <section className="bg-neutral-50 py-20">
      <div className="mx-auto max-w-6xl px-4">
        {title && <h2 className="text-3xl font-bold">{title}</h2>}
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {items.map((t, i) => (
            <blockquote key={i} className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-neutral-200">
              <p className="text-neutral-700 italic">« {t.quote} »</p>
              <footer className="mt-4 flex items-center gap-3">
                {t.avatar && mediaUrl(t.avatar, 'thumbnail') && (
                  <img src={mediaUrl(t.avatar, 'thumbnail')!} alt="" className="h-10 w-10 rounded-full object-cover" />
                )}
                <div>
                  <div className="font-semibold">{t.author}</div>
                  {t.role && <div className="text-sm text-neutral-500">{t.role}</div>}
                </div>
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  )
}
