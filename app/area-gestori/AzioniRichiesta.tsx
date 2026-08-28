'use client'

import { useActionState, useState } from 'react'
import { confermaPagamento, rifiutaPagamento } from './actions'
import { Spinner } from '@/app/components/Spinner'

/**
 * Le due decisioni possibili su una richiesta di pagamento: confermarla o
 * rifiutarla spiegando perché.
 *
 * Il rifiuto sta qui accanto alla conferma e non altrove perché è la stessa
 * decisione vista da due lati, e perché da quando la decorrenza la sceglie il
 * socio serve una via d'uscita per gli sbagli: senza, l'unico rimedio a una
 * data sbagliata sarebbe confermare e poi correggere a mano nel database.
 *
 * Il motivo si scrive prima di poter rifiutare, non dopo: è quello che il
 * socio legge, ed è l'unica cosa che gli dice che deve rifare la richiesta.
 */
export function AzioniRichiesta({ abbonamentoId }: { abbonamentoId: string }) {
  const [statoConferma, azioneConferma, confermaInCorso] = useActionState(confermaPagamento, null)
  const [statoRifiuto, azioneRifiuto, rifiutoInCorso] = useActionState(rifiutaPagamento, null)
  const [apriRifiuto, setApriRifiuto] = useState(false)
  const [motivo, setMotivo] = useState('')

  if (statoConferma?.ok) {
    return (
      <div className="text-right space-y-1">
        <p className="text-xs font-semibold text-green-600">✓ {statoConferma.message}</p>
        {statoConferma.ricevutaPath && (
          <a
            href={`/api/ricevuta-download?path=${encodeURIComponent(statoConferma.ricevutaPath)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs font-medium text-blue-600 underline"
          >
            Scarica ricevuta PDF
          </a>
        )}
      </div>
    )
  }

  if (statoRifiuto?.ok) {
    return <p className="text-xs font-semibold text-red-600 text-right">✕ {statoRifiuto.message}</p>
  }

  if (apriRifiuto) {
    return (
      <form action={azioneRifiuto} className="space-y-2">
        <input type="hidden" name="abbonamento_id" value={abbonamentoId} />
        <label className="block text-xs font-semibold text-gray-600">
          Perché la rifiuti — lo legge il socio
        </label>
        <textarea
          name="motivo"
          rows={2}
          maxLength={500}
          required
          value={motivo}
          onChange={e => setMotivo(e.target.value)}
          placeholder="Es.: hai chiesto la partenza dal mese in corso, ma volevi dal mese prossimo."
          className="w-full rounded-xl border border-gray-200 bg-white p-2.5 text-xs text-gray-800 shadow-sm transition-all focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100 resize-none"
        />
        {statoRifiuto?.ok === false && (
          <p className="text-xs text-red-500">{statoRifiuto.error}</p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setApriRifiuto(false)}
            disabled={rifiutoInCorso}
            className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:text-gray-800 transition-colors"
          >
            Annulla
          </button>
          <button
            type="submit"
            disabled={rifiutoInCorso || motivo.trim().length === 0}
            className="px-4 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-1.5"
          >
            {rifiutoInCorso && <Spinner className="h-3.5 w-3.5" />}
            {rifiutoInCorso ? 'Rifiuto in corso…' : 'Rifiuta richiesta'}
          </button>
        </div>
      </form>
    )
  }

  return (
    <form action={azioneConferma} className="flex items-center justify-end gap-2">
      <input type="hidden" name="abbonamento_id" value={abbonamentoId} />
      {statoConferma?.ok === false && (
        <p className="text-xs text-red-500 mr-auto">{statoConferma.error}</p>
      )}
      <button
        type="button"
        onClick={() => setApriRifiuto(true)}
        disabled={confermaInCorso}
        className="px-4 py-1.5 border border-gray-200 bg-white hover:border-red-300 hover:text-red-700 disabled:opacity-50 text-gray-600 text-xs font-bold rounded-xl transition-colors"
      >
        Rifiuta
      </button>
      <button
        type="submit"
        disabled={confermaInCorso}
        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-1.5"
      >
        {confermaInCorso && <Spinner className="h-3.5 w-3.5" />}
        {confermaInCorso ? 'Conferma in corso…' : 'Conferma pagamento'}
      </button>
    </form>
  )
}
