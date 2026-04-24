interface RichTextProps {
  title?: string | null
  body: unknown
  alignment?: 'left' | 'center'
}

/**
 * Rendu minimal du richText Lexical : on récupère le texte plat pour l'instant.
 * TODO: importer @payloadcms/richtext-lexical/react pour un rendu complet.
 */
function extractText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const n = node as { text?: string; children?: unknown[] }
  if (typeof n.text === 'string') return n.text
  if (Array.isArray(n.children)) return n.children.map(extractText).join(' ')
  return ''
}

export function RichTextBlock({ title, body, alignment = 'left' }: RichTextProps) {
  const text = extractText(body)
  return (
    <section className={`mx-auto max-w-4xl px-4 py-16 ${alignment === 'center' ? 'text-center' : ''}`}>
      {title && <h2 className="mb-6 text-3xl font-bold">{title}</h2>}
      {text && <div className="prose max-w-none text-lg leading-relaxed text-neutral-700">{text}</div>}
    </section>
  )
}
