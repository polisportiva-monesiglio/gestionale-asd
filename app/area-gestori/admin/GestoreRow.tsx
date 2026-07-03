'use client'

import { useActionState, useEffect, useState } from 'react'
import { aggiornaDatiGestore, aggiornaGestore, rimuoviGestore } from './actions'

type Props = {
  id: string
  nome: string | null
  email: string
  telefono: string | null
  attivo: boolean
  isAdmin: boolean
  isSelf: boolean
  haClaim: boolean
}

export function GestoreRow({ id, nome, email, telefono, attivo, isAdmin, isSelf, haClaim }: Props) {
  const [, toggleAttivoAction, pendingAttivo] = useActionState(aggiornaGestore, null)
  const [, toggleAdminAction, pendingAdmin] = useActionState(aggiornaGestore, null)
  const [, rimuoviAction, pendingRimuovi] = useActionState(rimuoviGestore, null)
  const [datiState, datiAction, pendingDati] = useActionState(aggiornaDatiGestore, null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (datiState?.ok) setEditing(false)
  }, [datiState])

  const pending = pendingAttivo || pendingAdmin || pendingRimuovi || pendingDati

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
              className="w-full max-w-[220px] text-xs px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            {!haClaim && (
              <input
                type="email"
                name="email"
                defaultValue={email}
                placeholder="Email"
                className="w-full max-w-[220px] text-xs px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            )}
            <input
              type="tel"
              name="telefono"
              defaultValue={telefono ?? ''}
              placeholder="Cellulare (es. 347 1234567)"
              className="w-full max-w-[220px] text-xs px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <div className="flex items-center gap-1.5">
              <button
                type="submit"
                disabled={pending}
                className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50 px-2 py-1 border border-blue-200 rounded-lg"
              >
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
              {nome || '—'} {isSelf && <span className="text-gray-400 font-normal">(tu)</span>}{' '}
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-xs text-blue-500 hover:text-blue-700 font-semibold"
              >
                Modifica
              </button>
            </p>
            <p className="text-xs text-gray-400 truncate">{email}</p>
            <p className="text-xs text-gray-400 truncate">{telefono ?? 'Nessun telefono'}</p>
          </>
        )}
        {datiState && !datiState.ok && (
          <p className="text-[10px] text-red-500 mt-0.5">{datiState.error}</p>
        )}
        {!haClaim && (
          <p className="text-[10px] text-orange-500 mt-0.5">In attesa di primo accesso</p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${attivo ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
          {attivo ? 'Attivo' : 'Disattivo'}
        </span>
        {isAdmin && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">
            Admin
          </span>
        )}

        {!isSelf && (
          <>
            <form action={toggleAttivoAction}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="campo" value="attivo" />
              <input type="hidden" name="valore" value={(!attivo).toString()} />
              <button
                type="submit"
                disabled={pending}
                className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 disabled:opacity-50 px-2 py-1 border border-gray-200 rounded-lg"
              >
                {attivo ? 'Disattiva' : 'Attiva'}
              </button>
            </form>

            <form action={toggleAdminAction}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="campo" value="is_admin" />
              <input type="hidden" name="valore" value={(!isAdmin).toString()} />
              <button
                type="submit"
                disabled={pending}
                className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 disabled:opacity-50 px-2 py-1 border border-gray-200 rounded-lg"
              >
                {isAdmin ? 'Rimuovi admin' : 'Rendi admin'}
              </button>
            </form>

            <form action={rimuoviAction}>
              <input type="hidden" name="id" value={id} />
              <button
                type="submit"
                disabled={pending}
                className="text-[10px] font-semibold text-red-500 hover:text-red-700 disabled:opacity-50 px-2 py-1 border border-red-200 rounded-lg"
              >
                Rimuovi
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
