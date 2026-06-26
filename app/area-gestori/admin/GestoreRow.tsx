'use client'

import { useActionState } from 'react'
import { aggiornaGestore, rimuoviGestore } from './actions'

type Props = {
  id: string
  nome: string | null
  email: string
  attivo: boolean
  isAdmin: boolean
  isSelf: boolean
  haClaim: boolean
}

export function GestoreRow({ id, nome, email, attivo, isAdmin, isSelf, haClaim }: Props) {
  const [, toggleAttivoAction, pendingAttivo] = useActionState(aggiornaGestore, null)
  const [, toggleAdminAction, pendingAdmin] = useActionState(aggiornaGestore, null)
  const [, rimuoviAction, pendingRimuovi] = useActionState(rimuoviGestore, null)

  const pending = pendingAttivo || pendingAdmin || pendingRimuovi

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 px-4 py-3 bg-gray-50">
      <div className="min-w-0">
        <p className="font-bold text-sm text-gray-900 truncate">
          {nome || '—'} {isSelf && <span className="text-gray-400 font-normal">(tu)</span>}
        </p>
        <p className="text-xs text-gray-400 truncate">{email}</p>
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
