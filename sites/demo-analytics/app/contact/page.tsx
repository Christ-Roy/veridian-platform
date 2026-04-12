"use client";

import { useState, type FormEvent } from "react";

export default function Contact() {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Le tracker Veridian intercepte le submit via data-veridian-track
    // Ici on affiche juste le message de confirmation
    setSubmitted(true);
  }

  return (
    <main className="py-16">
      <div className="mx-auto max-w-2xl px-6">
        <h1 className="text-3xl font-bold text-gray-900">
          Demander un devis
        </h1>
        <p className="mt-2 text-gray-600">
          Decrivez votre projet et nous vous recontactons sous 24h.
        </p>

        {submitted ? (
          <div className="mt-8 rounded-lg border border-veridian-500 bg-veridian-50 p-6 text-center">
            <p className="text-lg font-medium text-veridian-800">
              Merci, votre demande a ete envoyee !
            </p>
            <p className="mt-2 text-sm text-veridian-700">
              Nous vous recontactons dans les plus brefs delais.
            </p>
          </div>
        ) : (
          <form
            data-veridian-track="devis"
            onSubmit={handleSubmit}
            className="mt-8 space-y-5"
          >
            <div>
              <label
                htmlFor="entreprise"
                className="block text-sm font-medium text-gray-700"
              >
                Entreprise
              </label>
              <input
                id="entreprise"
                name="entreprise"
                type="text"
                placeholder="Nom de votre entreprise"
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-veridian-500 focus:outline-none focus:ring-1 focus:ring-veridian-500"
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="vous@entreprise.fr"
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-veridian-500 focus:outline-none focus:ring-1 focus:ring-veridian-500"
              />
            </div>

            <div>
              <label
                htmlFor="phone"
                className="block text-sm font-medium text-gray-700"
              >
                Telephone
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                placeholder="06 12 34 56 78"
                className="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-veridian-500 focus:outline-none focus:ring-1 focus:ring-veridian-500"
              />
            </div>

            <div>
              <label
                htmlFor="message"
                className="block text-sm font-medium text-gray-700"
              >
                Votre projet
              </label>
              <textarea
                id="message"
                name="message"
                placeholder="Decrivez votre projet en quelques lignes..."
                required
                rows={5}
                className="mt-1 block w-full rounded-md border border-gray-300 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-veridian-500 focus:outline-none focus:ring-1 focus:ring-veridian-500"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-md bg-veridian-600 px-6 py-3 text-white font-medium hover:bg-veridian-700 focus:outline-none focus:ring-2 focus:ring-veridian-500 focus:ring-offset-2"
            >
              Envoyer la demande
            </button>
          </form>
        )}

        <div className="mt-10 rounded-lg bg-gray-50 p-6">
          <p className="text-sm font-medium text-gray-900">
            Ou appelez-nous directement :
          </p>
          <a
            href="tel:+33482530429"
            className="mt-1 inline-block text-lg font-bold text-veridian-700 hover:text-veridian-800"
          >
            04 82 53 04 29
          </a>
        </div>
      </div>
    </main>
  );
}
