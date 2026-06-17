'use client'

import { useActionState } from 'react'
import { aggiornaCodiceCassetta } from './actions'

export function CodiceCassettaForm({ codiceAttuale }: { codiceAttuale: string | null }) {
  const [state, action, isPending] = useActionState(aggiornaCodiceCassetta, null)

  return (
    <form action={action} className="flex items-center gap-3">
      <input
        name="codice"
        type="text"
        defaultValue={codiceAttuale ?? ''}
        placeholder="Es. 12345678"
        maxLength={8}
        pattern="[0-9]{1,8}"
        title="Massimo 8 cifre numeriche"
        className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="submit"
        disabled={isPending}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors whitespace-nowrap"
      >
        {isPending ? 'Salvo…' : 'Aggiorna'}
      </button>
      {state?.ok && (
        <span className="text-xs text-green-600 font-medium">✓ Salvato</span>
      )}
      {state?.ok === false && (
        <span className="text-xs text-red-500">{state.error}</span>
      )}
    </form>
  )
}
