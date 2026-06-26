'use client'

import { useActionState, useState } from 'react'
import { aggiornaAttivita, toggleAttivaAttivita } from './actions'
import { AttivitaForm } from './AttivitaForm'

type Props = {
  id: string
  nome_attivita: string
  tipo: string
  prezzo_base: number
  durata_mesi: number
  quantita_ingressi: number
  attivo: boolean
}

const TIPO_LABEL: Record<string, string> = {
  abbonamento_mensile: 'Abbonamento',
  pacchetto_ingressi: 'Pacchetto ingressi',
}

export function AttivitaRow(props: Props) {
  const [editing, setEditing] = useState(false)
  const [, toggleAction, pendingToggle] = useActionState(toggleAttivaAttivita, null)

  if (editing) {
    return (
      <div className="rounded-2xl border border-blue-200 p-4 bg-blue-50/30">
        <AttivitaForm
          action={aggiornaAttivita}
          idAttivita={props.id}
          defaultValues={props}
          submitLabel="Salva modifiche"
          onSuccess={() => setEditing(false)}
        />
        <button
          onClick={() => setEditing(false)}
          className="mt-2 text-xs font-semibold text-gray-400 hover:text-gray-700"
        >
          Annulla
        </button>
      </div>
    )
  }

  return (
    <div className={`flex items-center justify-between gap-3 rounded-2xl border border-gray-100 px-4 py-3 ${props.attivo ? 'bg-gray-50' : 'bg-gray-100 opacity-60'}`}>
      <div className="min-w-0">
        <p className="font-bold text-sm text-gray-900 truncate">{props.nome_attivita}</p>
        <div className="flex flex-wrap gap-2 mt-1">
          <span className="text-[10px] px-2 py-0.5 bg-white border border-gray-200 rounded-lg text-gray-500">
            {TIPO_LABEL[props.tipo] ?? props.tipo}
          </span>
          <span className="text-[10px] px-2 py-0.5 bg-white border border-gray-200 rounded-lg text-gray-500">
            € {Number(props.prezzo_base).toFixed(2)}
          </span>
          {props.tipo === 'abbonamento_mensile' ? (
            <span className="text-[10px] px-2 py-0.5 bg-white border border-gray-200 rounded-lg text-gray-400">
              {props.durata_mesi} {props.durata_mesi === 1 ? 'mese' : 'mesi'}
            </span>
          ) : (
            <span className="text-[10px] px-2 py-0.5 bg-white border border-gray-200 rounded-lg text-gray-400">
              {props.quantita_ingressi} ingressi
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${props.attivo ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
          {props.attivo ? 'Attivo' : 'Disattivo'}
        </span>

        <button
          onClick={() => setEditing(true)}
          className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 px-2 py-1 border border-gray-200 rounded-lg"
        >
          Modifica
        </button>

        <form action={toggleAction}>
          <input type="hidden" name="id" value={props.id} />
          <input type="hidden" name="attivo" value={(!props.attivo).toString()} />
          <button
            type="submit"
            disabled={pendingToggle}
            className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 disabled:opacity-50 px-2 py-1 border border-gray-200 rounded-lg"
          >
            {props.attivo ? 'Disattiva' : 'Attiva'}
          </button>
        </form>
      </div>
    </div>
  )
}
