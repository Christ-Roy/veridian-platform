import { getPage } from '@/lib/cms'

export const dynamic = 'force-static'

export default async function Home() {
  const page = await getPage('home').catch((err) => {
    console.error('[demo-cms] fetch failed:', err)
    return null
  })

  const tenant = process.env.CMS_TENANT_SLUG || 'demo'
  const cmsUrl = process.env.CMS_API_URL || 'https://cms.staging.veridian.site'

  if (!page) {
    return (
      <main>
        <div className="empty">
          <h1>Demo CMS</h1>
          <p style={{ marginTop: '1rem' }}>
            Aucune page <code>home</code> trouvée pour le tenant <code>{tenant}</code>.
          </p>
          <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
            Crée une page <code>home</code> dans l'admin :{' '}
            <a href={`${cmsUrl}/admin`} style={{ color: '#0070f3' }}>{cmsUrl}/admin</a>
          </p>
        </div>
      </main>
    )
  }

  return (
    <main>
      <section className="hero">
        <span className="badge">Demo CMS · tenant: {tenant}</span>
        <h1 style={{ marginTop: '1rem' }}>{page.heroTitle || page.title}</h1>
        {page.heroSubtitle && <p>{page.heroSubtitle}</p>}
        {page.heroImage?.url && (
          <img
            src={new URL(page.heroImage.url, cmsUrl).toString()}
            alt={page.heroImage.alt || ''}
          />
        )}
      </section>

      {page.sections?.map((s, i) => (
        <section key={i} className="section">
          {s.heading && <h2>{s.heading}</h2>}
          {s.image?.url && (
            <img src={new URL(s.image.url, cmsUrl).toString()} alt={s.image.alt || ''} />
          )}
        </section>
      ))}

      <div className="footer-note">
        Site buildé depuis{' '}
        <a href={cmsUrl} style={{ color: '#555' }}>{new URL(cmsUrl).host}</a>
        {' · '}
        Tenant <code>{tenant}</code>
      </div>
    </main>
  )
}
