/**
 * SDK CMS — fetch au build depuis Payload.
 * Identique pour tous les sites Veridian, seuls CMS_TENANT_SLUG + CMS_API_KEY changent.
 */
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
  meta?: {
    title?: string | null
    description?: string | null
    image?: Media
  }
}

export interface HeaderDoc {
  logo?: Media
  logoText?: string | null
  nav?: Array<{ label: string; url: string }>
  cta?: { label?: string | null; url?: string | null } | null
}

export interface FooterDoc {
  company?: { name?: string | null; tagline?: string | null; phone?: string | null; email?: string | null; address?: string | null }
  hours?: Array<{ day: string; time: string }>
  social?: { facebook?: string | null; instagram?: string | null; linkedin?: string | null; google?: string | null }
  legal?: { siret?: string | null; mentionsUrl?: string | null }
}

interface TenantDoc { id: number; slug: string; name: string }

async function api<T>(path: string): Promise<T | null> {
  try {
    const url = `${API_URL}/api${path}`
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

export async function getPage(slug: string): Promise<PageDoc | null> {
  const tenantId = await getTenantId()
  if (!tenantId) return null
  const data = await api<{ docs: PageDoc[] }>(
    `/pages?where[tenant][equals]=${tenantId}&where[slug][equals]=${encodeURIComponent(slug)}&limit=1&depth=2`,
  )
  return data?.docs[0] ?? null
}

export async function getHeader(): Promise<HeaderDoc | null> {
  // ⚠️ Le plugin multi-tenant Payload ne filtre PAS automatiquement pour les
  //    API keys (pas de cookie). On doit passer le tenant id explicitement.
  const tenantId = await getTenantId()
  if (!tenantId) return null
  const data = await api<{ docs: HeaderDoc[] }>(
    `/header?where[tenant][equals]=${tenantId}&limit=1&depth=2`,
  )
  return data?.docs?.[0] ?? null
}

export async function getFooter(): Promise<FooterDoc | null> {
  const tenantId = await getTenantId()
  if (!tenantId) return null
  const data = await api<{ docs: FooterDoc[] }>(
    `/footer?where[tenant][equals]=${tenantId}&limit=1&depth=2`,
  )
  return data?.docs?.[0] ?? null
}

export function mediaUrl(media: Media, size?: 'thumbnail' | 'card' | 'hero'): string | null {
  if (!media) return null
  const url = size && media.sizes?.[size]?.url ? media.sizes[size].url : media.url
  if (!url) return null
  return new URL(url, API_URL).toString()
}
