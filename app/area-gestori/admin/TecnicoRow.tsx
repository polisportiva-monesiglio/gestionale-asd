'use client'

import { useActionState, useEffect, useState } from 'react'
import { aggiornaDatiTecnico, aggiornaTecnico, rimuoviTecnico } from './actions'
import { Spinner } from '@/app/components/Spinner'

type Props = {
  id: string
  nome: string | null
  email: string
  telefono: string | null
  attivo: boolean
  haClaim: boolean
  corsi: string[]
}

export function TecnicoRow({ id, nome, email, telefono, attivo, haClaim, corsi }: Props) {
  const [, attivoAction, pendingAttivo] = useActionState(aggiornaTecnico, null)
  const [rimuoviState, rimuoviAction, pendingRimuovi] = useActionState(rimuoviTecnico, null)
  const [datiState, datiAction, pendingDati] = useActionState(aggiornaDatiTecnico, null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (datiState?.ok) setEditing(false)
  }, [datiState])

  const pending = pendingAttivo || pendingRimuovi || pendingDati

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 px-4 py-3 bg-gray-50">
      <div className="min-w-0 flex-1">
        {editing ? (
          <form action={datiAction} className="flex flex-col gap-1.5">
            <input type="hidden" name="id" value={id} />
            <input
              type="text"
              name="nome"
              defaultValue={nome ?? ''}
              placeholder="Nome e cognome"
              className="w-full max-w-[220px] text-xs px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-400"
            />
            {/* L'email si cambia solo prima del primo accesso: dopo e' la
                chiave che lega la riga al suo account. */}
            {!haClaim && (
              <input
                type="email"
                name="email"
                defaultValue={email}
                placeholder="Email"
                className="w-full max-w-[220px] text-xs px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-400"
              />
            )}
            <input
              type="tel"
              name="telefono"
              defaultValue={telefono ?? ''}
              placeholder="Cellulare"
              className="w-full max-w-[220px] text-xs px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-400"
            />
            <div className="flex items-center gap-1.5">
              <button
                type="submit"
                disabled={pending}
                className="text-[10px] font-semibold text-emerald-700 hover:text-emerald-900 disabled:opacity-50 px-2 py-1 border border-emerald-200 rounded-lg inline-flex items-center gap-1"
              >
                {pendingDati && <Spinner className="h-3 w-3" />}
                Salva
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-[10px] font-semibold text-gray-400 hover:text-gray-600 px-1 py-1"
              >
                Annulla
              </button>
            </div>
          </form>
        ) : (
          <>
            <p className="font-bold text-sm text-gray-900 truncate">
              {nome || '—'}{' '}
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-xs text-emerald-600 hover:text-emerald-800 font-semibold"
              >
                Modifica
              </button>
            </p>
            <p className="text-xs text-gray-400 truncate">{email}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {corsi.length > 0 ? `Corsi: ${corsi.join(', ')}` : 'Nessun corso assegnato: assegnalo dal catalogo'}
            </p>
          </>
        )}
        {datiState && !datiState.ok && <p className="text-[10px] text-red-500 mt-0.5">{datiState.error}</p>}
        {rimuoviState && !rimuoviState.ok && <p className="text-[10px] text-red-500 mt-0.5">{rimuoviState.error}</p>}
        {!haClaim && <p className="text-[10px] text-orange-500 mt-0.5">In attesa di primo accesso</p>}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${attivo ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
          {attivo ? 'Attivo' : 'Disattivo'}
        </span>

        <form action={attivoAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="valore" value={(!attivo).toString()} />
          <button
            type="submit"
            disabled={pending}
            className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 disabled:opacity-50 px-2 py-1 border border-gray-200 rounded-lg inline-flex items-center gap-1"
          >
            {pendingAttivo && <Spinner className="h-3 w-3" />}
            {attivo ? 'Disattiva' : 'Attiva'}
          </button>
        </form>

        <form action={rimuoviAction}>
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            disabled={pending}
            className="text-[10px] font-semibold text-red-500 hover:text-red-700 disabled:opacity-50 px-2 py-1 border border-red-200 rounded-lg inline-flex items-center gap-1"
          >
            {pendingRimuovi && <Spinner className="h-3 w-3" />}
            Rimuovi
          </button>
        </form>
      </div>
    </div>
  )
}
