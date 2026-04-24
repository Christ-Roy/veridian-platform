const API_URL = process.env.CMS_API_URL || 'https://cms.staging.veridian.site'
const TENANT_SLUG = process.env.CMS_TENANT_SLUG || 'artisan'
const API_KEY = process.env.CMS_API_KEY

type Media = { url?: string; alt?: string; sizes?: Record<string, { url?: string }> } | null

export type Block =
  | {
      blockType: 'hero'
      eyebrow?: string | null
      title: string
      subtitle?: string | null
      image?: Media
      ctas?: Array<{ label: string; url: string; variant?: 'primary' | 'secondary' }>
    }
  | {
      blockType: 'services'
      title?: string | null
      subtitle?: string | null
      items: Array<{ icon?: string; title: string; description?: string | null }>
    }
  | {
      blockType: 'gallery'
      title?: string | null
      subtitle?: string | null
      images: Array<{ image: Media; caption?: string | null }>
    }
  | {
      blockType: 'testimonials'
      title?: string | null
      items: Array<{ quote: string; author: string; role?: string | null; avatar?: Media }>
    }
  | {
      blockType: 'richtext'
      title?: string | null
      body: unknown
      alignment?: 'left' | 'center'
    }
  | {
      blockType: 'cta'
      title: string
      description?: string | null
      ctaLabel: string
      ctaUrl: string
    }

export interface PageDoc {
  id: number
  title: string
  slug: string
  blocks?: Block[]
  seo?: {
    metaTitle?: string | null
    metaDescription?: string | null
    ogImage?: Media
  }
}

interface TenantDoc { id: number; slug: string; name: string }

async function api<T>(path: string, opts: { preview?: boolean } = {}): Promise<T | null> {
  try {
    const url = `${API_URL}/api${path}${opts.preview ? (path.includes('?') ? '&' : '?') + 'draft=true' : ''}`
    const headers: Record<string, string> = {}
    if (API_KEY) headers.Authorization = `users API-Key ${API_KEY}`
    const res = await fetch(url, { headers, cache: 'no-store' })
    if (!res.ok) {
      console.warn(`[cms] ${res.status} ${url}`)
      return null
    }
    return (await res.json()) as T
  } catch (err) {
    console.warn('[cms] fetch failed, using fallback', err)
    return null
  }
}

let _tenantId: number | null | undefined
async function getTenantId(): Promise<number | null> {
  if (_tenantId !== undefined) return _tenantId
  const data = await api<{ docs: TenantDoc[] }>(
    `/tenants?where[slug][equals]=${encodeURIComponent(TENANT_SLUG)}&limit=1`,
  )
  _tenantId = data?.docs[0]?.id ?? null
  return _tenantId
}

export async function getPage(slug: string, opts: { preview?: boolean } = {}): Promise<PageDoc | null> {
  const tenantId = await getTenantId()
  if (!tenantId) return null
  const data = await api<{ docs: PageDoc[] }>(
    `/pages?where[tenant][equals]=${tenantId}&where[slug][equals]=${encodeURIComponent(slug)}&limit=1&depth=2`,
    opts,
  )
  return data?.docs[0] ?? null
}

export function mediaUrl(media: Media, size?: 'thumbnail' | 'card' | 'hero'): string | null {
  if (!media) return null
  const url = size && media.sizes?.[size]?.url ? media.sizes[size].url : media.url
  if (!url) return null
  return new URL(url, API_URL).toString()
}
