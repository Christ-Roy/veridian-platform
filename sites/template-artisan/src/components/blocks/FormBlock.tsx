'use client'
import { useState } from 'react'
import type { FormDoc } from '@/lib/cms'

const CMS_API_URL = process.env.NEXT_PUBLIC_CMS_API_URL || 'https://cms.staging.veridian.site'

interface Props {
  title?: string | null
  subtitle?: string | null
  form: string | number | FormDoc
}

/**
 * Affiche un formulaire CMS-driven.
 * Le form est soit populé par l'API (objet FormDoc complet), soit juste un id/slug
 * (dans ce cas on n'affiche rien — fallback).
 */
export function FormBlock({ title, subtitle, form }: Props) {
  if (typeof form !== 'object') {
    return (
      <section className="mx-auto max-w-3xl px-4 py-16 text-center text-neutral-600">
        <p>Formulaire non disponible.</p>
      </section>
    )
  }
  return <FormRenderer title={title} subtitle={subtitle} form={form} />
}

function FormRenderer({ title, subtitle, form }: { title?: string | null; subtitle?: string | null; form: FormDoc }) {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('submitting')
    setErrorMsg(null)

    const data = new FormData(e.currentTarget)
    const submissionData = form.fields
      .filter((f) => f.blockType !== 'message')
      .map((f) => ({
        field: f.name,
        value: data.get(f.name)?.toString() ?? '',
      }))

    try {
      const res = await fetch(`${CMS_API_URL}/api/form-submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form: form.id, submissionData }),
      })
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(txt.slice(0, 200))
      }
      setStatus('success')
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Erreur inconnue')
    }
  }

  if (status === 'success') {
    return (
      <section className="mx-auto max-w-3xl px-4 py-20 text-center">
        <div className="rounded-lg bg-brand-50 p-8 ring-1 ring-brand-200">
          <div className="mb-3 text-4xl">✅</div>
          <h2 className="text-2xl font-bold text-brand-800">Message envoyé</h2>
          <p className="mt-2 text-neutral-700">
            Merci pour votre message. Nous vous répondrons sous 24h ouvrées.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-3xl px-4 py-16">
      {title && <h2 className="text-3xl font-bold text-center">{title}</h2>}
      {subtitle && <p className="mt-3 text-center text-neutral-600">{subtitle}</p>}

      <form onSubmit={onSubmit} className="mt-10 space-y-5 rounded-xl bg-white p-8 shadow-sm ring-1 ring-neutral-200">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {form.fields.map((field) => (
            <div key={field.name} className={field.width && field.width >= 100 ? 'md:col-span-2' : ''}>
              <FormField field={field} />
            </div>
          ))}
        </div>
        {status === 'error' && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
            Une erreur est survenue : {errorMsg}
          </div>
        )}
        <button
          type="submit"
          disabled={status === 'submitting'}
          className="w-full rounded-md bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {status === 'submitting' ? 'Envoi…' : form.submitButtonLabel || 'Envoyer'}
        </button>
      </form>
    </section>
  )
}

function FormField({ field }: { field: FormDoc['fields'][number] }) {
  const commonProps = {
    name: field.name,
    id: field.name,
    required: field.required,
    className:
      'mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600',
  }
  const Label = (
    <label htmlFor={field.name} className="block text-sm font-medium">
      {field.label}
      {field.required && <span className="ml-1 text-red-500">*</span>}
    </label>
  )

  switch (field.blockType) {
    case 'text':
    case 'number':
    case 'email':
      return (
        <>
          {Label}
          <input type={field.blockType === 'number' ? 'number' : field.blockType === 'email' ? 'email' : 'text'} {...commonProps} />
        </>
      )
    case 'textarea':
      return (
        <>
          {Label}
          <textarea rows={5} {...commonProps} />
        </>
      )
    case 'select':
      return (
        <>
          {Label}
          <select {...commonProps}>
            <option value="">— Choisir —</option>
            {field.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </>
      )
    case 'checkbox':
      return (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name={field.name} required={field.required} className="mt-1" />
          <span>
            {field.label}
            {field.required && <span className="ml-1 text-red-500">*</span>}
          </span>
        </label>
      )
    case 'message':
      return <div className="text-sm text-neutral-600">{/* rendu message plat */}</div>
    default:
      return null
  }
}
