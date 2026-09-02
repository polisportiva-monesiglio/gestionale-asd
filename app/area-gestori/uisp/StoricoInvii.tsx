'use client'

import { useActionState } from 'react'
import { Spinner } from '@/app/components/Spinner'
import { annullaInvio, type EsitoInvio } from './actions'

export type InvioFatto = {
  id: string
  numero: number
  creatoIl: string
  conteggio: number
  annullatoIl: string | null
  gestore: string | null
}

function formatQuando(d: string) {
  return new Date(d).toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function RigaInvio({ invio }: { invio: InvioFatto }) {
  const [stato, azione, inCorso] = useActionState<EsitoInvio | null, FormData>(annullaInvio, null)
  const annullato = !!invio.annullatoIl

  return (
    <div
      className={`rounded-2xl border p-4 ${
        annullato ? 'border-gray-200 bg-gray-50' : 'border-green-200 bg-green-50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900">
            Invio n. {invio.numero}
            {annullato && <span className="text-gray-400 font-semibold"> · annullato</span>}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {formatQuando(invio.creatoIl)} · {invio.conteggio}{' '}
            {invio.conteggio === 1 ? 'socio' : 'soci'}
            {invio.gestore ? ` · ${invio.gestore}` : ''}
          </p>
          {annullato && (
            <p className="text-xs text-gray-400 mt-0.5">
              Annullato il {formatQuando(invio.annullatoIl!)}: i soci sono tornati da mandare.
            </p>
          )}
          {stato?.ok === false && (
            <p className="text-xs text-red-600 font-medium mt-1.5">{stato.error}</p>
          )}
          {stato?.ok === true && (
            <p className="text-xs text-green-700 font-medium mt-1.5">{stato.message}</p>
          )}
        </div>

        {!annullato && (
          <div className="shrink-0 flex flex-col items-end gap-1.5">
            <span className="text-xs font-semibold text-green-700">
              ↗{' '}
              <a
                href={`/api/uisp/modulo?invio_id=${encodeURIComponent(invio.id)}&formato=pdf`}
                className="underline underline-offset-2 hover:text-green-900"
              >
                PDF
              </a>
              {' · '}
              <a
                href={`/api/uisp/modulo?invio_id=${encodeURIComponent(invio.id)}&formato=xlsx`}
                className="underline underline-offset-2 hover:text-green-900"
              >
                Excel
              </a>
            </span>
            <form action={azione}>
              <input type="hidden" name="invio_id" value={invio.id} />
              <button
                type="submit"
                disabled={inCorso}
                className="text-xs font-semibold text-gray-500 hover:text-red-700 underline underline-offset-2 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {inCorso && <Spinner className="h-3 w-3" />}
                Annulla invio
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

export function StoricoInvii({ invii }: { invii: InvioFatto[] }) {
  if (invii.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-4">
        Nessun invio per questa stagione.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {invii.map(i => (
        <RigaInvio key={i.id} invio={i} />
      ))}
    </div>
  )
}
