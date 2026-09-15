'use client'

import { useActionState } from 'react'
import { confermaPagamentoCorso, type EsitoTecnico } from './actions'
import { Spinner } from '@/app/components/Spinner'

/**
 * Il pulsante con cui il tecnico conferma di aver ricevuto il pagamento.
 *
 * Porta scritto l'importo: chi conferma deve aver davanti la cifra che sta
 * dichiarando di aver incassato, non un "Conferma" generico.
 */
export function ConfermaCorso({ abbonamentoId, totale }: { abbonamentoId: string; totale: number }) {
  const [stato, azione, inCorso] = useActionState<EsitoTecnico | null, FormData>(
    confermaPagamentoCorso,
    null
  )

  if (stato?.ok) {
    return (
      <p className="text-xs font-semibold text-green-700">
        ✓ {stato.message}. La ricevuta è partita per email al socio.
      </p>
    )
  }

  return (
    <form action={azione} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="abbonamento_id" value={abbonamentoId} />
      {stato?.ok === false && <p className="text-xs text-red-600 mr-auto">{stato.error}</p>}
      <button
        type="submit"
        disabled={inCorso}
        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-1.5"
      >
        {inCorso && <Spinner className="h-3.5 w-3.5" />}
        {inCorso ? 'Conferma in corso…' : `Ho ricevuto €${totale.toFixed(2)} · Conferma`}
      </button>
    </form>
  )
}
