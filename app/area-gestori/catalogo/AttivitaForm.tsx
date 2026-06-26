'use client'

import { useActionState, useEffect, useState } from 'react'

type Values = {
  nome_attivita: string
  tipo: string
  prezzo_base: number
  durata_mesi: number
  quantita_ingressi: number
}

type Props = {
  action: (prev: { ok: true; message: string } | { ok: false; error: string } | null, formData: FormData) => Promise<{ ok: true; message: string } | { ok: false; error: string }>
  defaultValues?: Values
  idAttivita?: string
  submitLabel: string
  onSuccess?: () => void
}

export function AttivitaForm({ action, defaultValues, idAttivita, submitLabel, onSuccess }: Props) {
  const [state, formAction, isPending] = useActionState(action, null)
  const [tipo, setTipo] = useState(defaultValues?.tipo ?? 'abbonamento_mensile')

  useEffect(() => {
    if (state?.ok) onSuccess?.()
  }, [state, onSuccess])

  return (
    <form action={formAction} className="space-y-3">
      {idAttivita && <input type="hidden" name="id" value={idAttivita} />}

      <div className="grid grid-cols-2 gap-3">
        <input
          name="nome_attivita"
          type="text"
          required
          defaultValue={defaultValues?.nome_attivita}
          placeholder="Nome (es. Abbonamento mensile – Fitness)"
          className="col-span-2 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <select
          name="tipo"
          value={tipo}
          onChange={e => setTipo(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="abbonamento_mensile">Abbonamento (a durata)</option>
          <option value="pacchetto_ingressi">Pacchetto ingressi</option>
        </select>

        <input
          name="prezzo_base"
          type="number"
          step="0.01"
          min="0"
          required
          defaultValue={defaultValues?.prezzo_base}
          placeholder="Prezzo €"
          className="px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {tipo === 'abbonamento_mensile' ? (
          <input
            name="durata_mesi"
            type="number"
            min="1"
            defaultValue={defaultValues?.durata_mesi ?? 1}
            placeholder="Durata (mesi)"
            className="col-span-2 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        ) : (
          <input
            name="quantita_ingressi"
            type="number"
            min="1"
            defaultValue={defaultValues?.quantita_ingressi ?? 1}
            placeholder="Numero ingressi"
            className="col-span-2 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors"
        >
          {isPending ? 'Salvo…' : submitLabel}
        </button>
        {state?.ok && <span className="text-xs text-green-600 font-medium">✓ {state.message}</span>}
        {state?.ok === false && <span className="text-xs text-red-500">{state.error}</span>}
      </div>
    </form>
  )
}
