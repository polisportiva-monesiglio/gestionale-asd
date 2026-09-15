'use client'

import { useActionState, useEffect, useState } from 'react'
import { Spinner } from '@/app/components/Spinner'

export type TecnicoOpzione = {
  id: string
  nome: string | null
  email: string
  attivo: boolean
}

type Values = {
  nome_attivita: string
  tipo: string
  prezzo_base: number
  durata_mesi: number
  quantita_ingressi: number
  tecnici?: string[]
}

type Esito = { ok: true; message: string } | { ok: false; error: string }

type Props = {
  action: (prev: Esito | null, formData: FormData) => Promise<Esito>
  defaultValues?: Values
  idAttivita?: string
  submitLabel: string
  onSuccess?: () => void
  /** Chi puo' tenere un corso. Serve solo quando il tipo e' "Corso". */
  tecnici: TecnicoOpzione[]
  /** Solo un amministratore sceglie i tecnici; gli altri li vedono e basta. */
  puoAssegnare: boolean
}

export function AttivitaForm({ action, defaultValues, idAttivita, submitLabel, onSuccess, tecnici, puoAssegnare }: Props) {
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
          placeholder={tipo === 'corso' ? 'Nome (es. Corpo in movimento – Mensile)' : 'Nome (es. Sala pesi – 1 mese)'}
          className="col-span-2 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <select
          name="tipo"
          value={tipo}
          onChange={e => setTipo(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="abbonamento_mensile">Periodo di frequenza (a durata)</option>
          <option value="corso">Corso (a durata)</option>
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

        {tipo !== 'pacchetto_ingressi' ? (
          <input
            name="durata_mesi"
            type="number"
            min="1"
            required={tipo === 'corso'}
            defaultValue={defaultValues?.durata_mesi || 1}
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

      {tipo === 'corso' && (
        <fieldset className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
          <legend className="px-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">
            Chi tiene il corso
          </legend>
          {!puoAssegnare ? (
            <p className="text-xs text-gray-600">
              {(() => {
                const nomi = tecnici.filter(t => defaultValues?.tecnici?.includes(t.id)).map(t => t.nome ?? t.email)
                return nomi.length > 0 ? nomi.join(', ') : 'Nessun tecnico: le richieste le confermano i gestori.'
              })()}
              <span className="block mt-1 text-[10px] text-gray-400">
                I tecnici li assegna un amministratore.
              </span>
            </p>
          ) : tecnici.length === 0 ? (
            <p className="text-xs text-orange-600">
              Nessun tecnico ancora: aggiungilo da Gestori → Tecnici dei corsi. Intanto le
              richieste di questo corso le confermano i gestori.
            </p>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {tecnici.map(t => (
                <label key={t.id} className="inline-flex items-center gap-1.5 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    name="tecnici"
                    value={t.id}
                    defaultChecked={defaultValues?.tecnici?.includes(t.id)}
                    className="accent-blue-600"
                  />
                  {t.nome ?? t.email}
                  {!t.attivo && <span className="text-gray-400">(disattivo)</span>}
                </label>
              ))}
            </div>
          )}
          <p className="mt-1.5 text-[10px] text-gray-400">
            Il tecnico vede solo i partecipanti dei corsi a cui è assegnato, e ne conferma i pagamenti.
          </p>
        </fieldset>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-1.5"
        >
          {isPending && <Spinner className="h-3.5 w-3.5" />}
          {isPending ? 'Salvo…' : submitLabel}
        </button>
        {state?.ok && <span className="text-xs text-green-600 font-medium">✓ {state.message}</span>}
        {state?.ok === false && <span className="text-xs text-red-500">{state.error}</span>}
      </div>
    </form>
  )
}
