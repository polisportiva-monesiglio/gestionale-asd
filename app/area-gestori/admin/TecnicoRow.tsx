'use client'

import { useActionState, useEffect, useState } from 'react'
import { aggiornaDatiTecnico, aggiornaTecnico, assegnaCorsiTecnico, rimuoviTecnico } from './actions'
import { Spinner } from '@/app/components/Spinner'

export type CorsoOpzione = { id: string; nome: string; attivo: boolean }

type Props = {
  id: string
  nome: string | null
  email: string
  telefono: string | null
  attivo: boolean
  haClaim: boolean
  corsiAssegnati: string[]
  corsi: CorsoOpzione[]
}

export function TecnicoRow({ id, nome, email, telefono, attivo, haClaim, corsiAssegnati, corsi }: Props) {
  const [, attivoAction, pendingAttivo] = useActionState(aggiornaTecnico, null)
  const [rimuoviState, rimuoviAction, pendingRimuovi] = useActionState(rimuoviTecnico, null)
  const [datiState, datiAction, pendingDati] = useActionState(aggiornaDatiTecnico, null)
  const [editing, setEditing] = useState(false)
  const [sceltaCorsi, setSceltaCorsi] = useState(false)
  // Il pannello si chiude dentro l'azione, a salvataggio riuscito, invece che
  // in un effetto che guarda l'esito.
  const [corsiState, corsiAction, pendingCorsi] = useActionState(
    async (prev: Awaited<ReturnType<typeof assegnaCorsiTecnico>> | null, formData: FormData) => {
      const esito = await assegnaCorsiTecnico(prev, formData)
      if (esito.ok) setSceltaCorsi(false)
      return esito
    },
    null
  )

  useEffect(() => {
    if (datiState?.ok) setEditing(false)
  }, [datiState])

  const pending = pendingAttivo || pendingRimuovi || pendingDati || pendingCorsi
  const nomiCorsi = corsi.filter(c => corsiAssegnati.includes(c.id)).map(c => c.nome)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 px-4 py-3 bg-gray-50">
      <div className="min-w-0 flex-1 basis-56">
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
          </>
        )}

        {sceltaCorsi ? (
          <form action={corsiAction} className="mt-2 rounded-xl border border-emerald-200 bg-white px-3 py-2.5 space-y-2">
            <input type="hidden" name="id" value={id} />
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Corsi che tiene</p>
            {corsi.length === 0 ? (
              <p className="text-xs text-orange-600">
                Nessun corso nel catalogo: crealo da Catalogo attività, con tipo «Corso».
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {corsi.map(c => (
                  <label key={c.id} className="flex items-start gap-1.5 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      name="corsi"
                      value={c.id}
                      defaultChecked={corsiAssegnati.includes(c.id)}
                      className="accent-emerald-600 mt-0.5 shrink-0"
                    />
                    <span>
                      {c.nome}
                      {!c.attivo && <span className="text-gray-400"> (non più a listino)</span>}
                    </span>
                  </label>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <button
                type="submit"
                disabled={pending}
                className="text-[10px] font-semibold text-emerald-700 hover:text-emerald-900 disabled:opacity-50 px-2 py-1 border border-emerald-200 rounded-lg inline-flex items-center gap-1"
              >
                {pendingCorsi && <Spinner className="h-3 w-3" />}
                Salva corsi
              </button>
              <button
                type="button"
                onClick={() => setSceltaCorsi(false)}
                className="text-[10px] font-semibold text-gray-400 hover:text-gray-600 px-1 py-1"
              >
                Annulla
              </button>
            </div>
          </form>
        ) : (
          <p className="text-xs text-gray-500 mt-0.5">
            {nomiCorsi.length > 0 ? `Corsi: ${nomiCorsi.join(', ')}` : 'Nessun corso assegnato'}{' '}
            <button
              type="button"
              onClick={() => setSceltaCorsi(true)}
              className="text-xs text-emerald-600 hover:text-emerald-800 font-semibold"
            >
              Assegna corsi
            </button>
          </p>
        )}

        {corsiState?.ok && !sceltaCorsi && <p className="text-[10px] text-green-600 mt-0.5">✓ {corsiState.message}</p>}
        {corsiState && !corsiState.ok && <p className="text-[10px] text-red-500 mt-0.5">{corsiState.error}</p>}
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
