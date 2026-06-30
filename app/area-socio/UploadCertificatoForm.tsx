'use client'

import { useActionState } from 'react'
import { uploadCertificato, type ActionResult } from './actions'

const inputClass = 'w-full p-3.5 rounded-xl border border-gray-200 shadow-sm transition-all focus:outline-none focus:ring-2 bg-white focus:border-yellow-400 focus:ring-yellow-200 text-gray-800 hover:border-gray-300 text-sm'

export default function UploadCertificatoForm({ hasExisting }: { hasExisting: boolean }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    uploadCertificato,
    null
  )

  if (state?.ok) {
    return (
      <div className="rounded-2xl bg-green-50 border border-green-200 px-5 py-4">
        <p className="text-sm font-semibold text-green-700">
          Certificato aggiornato con successo.
        </p>
        <p className="text-sm text-green-600 mt-1">
          La segreteria potrà verificarlo al tuo prossimo accesso in sede.
        </p>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Documento (PDF)
          </label>
          <input
            name="file"
            type="file"
            accept="application/pdf"
            required
            className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-yellow-400 file:text-gray-900 hover:file:bg-yellow-500 file:transition-colors file:cursor-pointer cursor-pointer"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Data del certificato
          </label>
          <input
            name="data_certificato"
            type="date"
            required
            className={inputClass}
          />
        </div>
      </div>

      {state?.ok === false && (
        <p className="text-red-500 text-xs font-medium pl-1">{state.error}</p>
      )}

      <div className="flex justify-center">
        <button
          type="submit"
          disabled={pending}
          className="bg-yellow-400 text-gray-900 px-8 py-3.5 rounded-xl font-bold text-sm hover:bg-yellow-500 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending
            ? 'Caricamento in corso...'
            : hasExisting
              ? 'Rinnova certificato'
              : 'Carica certificato'}
        </button>
      </div>
    </form>
  )
}
