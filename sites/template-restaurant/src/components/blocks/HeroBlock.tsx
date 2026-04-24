import Link from 'next/link'
import { mediaUrl } from '@/lib/cms'

interface HeroProps {
  eyebrow?: string | null
  title: string
  subtitle?: string | null
  image?: { url?: string; alt?: string; sizes?: Record<string, { url?: string }> } | null
  ctas?: Array<{ label: string; url: string; variant?: 'primary' | 'secondary' }>
}

const FALLBACK = 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=1920&q=80'

export function HeroBlock({ eyebrow, title, subtitle, image, ctas }: HeroProps) {
  const bg = mediaUrl(image ?? null, 'hero') ?? FALLBACK
  return (
    <section className="relative overflow-hidden bg-neutral-900 text-white">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-40"
        style={{ backgroundImage: `url(${bg})` }}
      />
      <div className="relative mx-auto max-w-6xl px-4 py-32 md:py-40">
        <div className="max-w-2xl">
          {eyebrow && (
            <span className="inline-block rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
              {eyebrow}
            </span>
          )}
          <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-6xl">{title}</h1>
          {subtitle && <p className="mt-6 text-xl text-neutral-200">{subtitle}</p>}
          {ctas && ctas.length > 0 && (
            <div className="mt-8 flex flex-wrap gap-3">
              {ctas.map((c, i) => (
                <Link
                  key={i}
                  href={c.url}
                  className={
                    c.variant === 'secondary'
                      ? 'inline-flex items-center gap-2 rounded-md border border-white/30 bg-white/10 px-6 py-3 font-semibold backdrop-blur hover:bg-white/20'
                      : 'inline-flex items-center gap-2 rounded-md bg-brand-600 px-6 py-3 font-semibold hover:bg-brand-700'
                  }
                >
                  {c.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
