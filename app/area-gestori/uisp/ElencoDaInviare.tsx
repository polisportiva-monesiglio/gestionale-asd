'use client'

import { useMemo, useState } from 'react'
import { Spinner } from '@/app/components/Spinner'

export type SocioDaInviare = {
  tesseramentoId: string
  nominativo: string
  cf: string | null
  firmatoIl: string | null
  quotaVersata: boolean
  /** Etichette dei campi che la UISP pretende e che nel database mancano. */
  mancanti: string[]
}

function formatData(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function ElencoDaInviare({ soci }: { soci: SocioDaInviare[] }) {
  // Preselezione: chi ha versato la quota e ha i dati completi. Gli altri si
  // possono aggiungere a mano, ma non li spuntiamo noi al posto del gestore.
  const [scelti, setScelti] = useState<Set<string>>(
    () => new Set(soci.filter(s => s.quotaVersata && s.mancanti.length === 0).map(s => s.tesseramentoId))
  )
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  const selezionati = useMemo(() => soci.filter(s => scelti.has(s.tesseramentoId)), [soci, scelti])
  const conBuchi = selezionati.filter(s => s.mancanti.length > 0)
  const tuttiScelti = selezionati.length === soci.length

  function commuta(id: string) {
    setScelti(prec => {
      const next = new Set(prec)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function scarica() {
    setInCorso(true)
    setErrore(null)
    try {
      const risposta = await fetch('/api/uisp/modulo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tesseramentoIds: [...scelti] }),
      })

      if (!risposta.ok) {
        const dettaglio = await risposta.json().catch(() => null)
        setErrore(dettaglio?.error ?? 'Generazione del modulo fallita.')
        return
      }

      // Il file arriva come allegato: lo salviamo e poi ricarichiamo, così
      // l'elenco si svuota di chi è appena stato marcato come inviato.
      const blob = await risposta.blob()
      const intestazione = risposta.headers.get('Content-Disposition') ?? ''
      const trovato = /filename="([^"]+)"/.exec(intestazione)
      const nome = trovato ? decodeURIComponent(trovato[1]) : 'modulo-uisp.xlsx'

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nome
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      window.location.reload()
    } catch {
      setErrore('Connessione persa durante la generazione del modulo.')
    } finally {
      setInCorso(false)
    }
  }

  if (soci.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-6">
        Nessun tesseramento in attesa: sono già stati mandati tutti.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setScelti(new Set(soci.map(s => s.tesseramentoId)))}
          disabled={tuttiScelti}
          className="text-xs font-bold text-gray-800 hover:text-gray-900 px-3 py-2 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Seleziona tutti ({soci.length})
        </button>
        <button
          type="button"
          onClick={() => setScelti(new Set())}
          disabled={selezionati.length === 0}
          className="text-xs font-semibold text-gray-500 hover:text-gray-800 underline underline-offset-2 disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
        >
          Deseleziona tutti
        </button>
      </div>

      <div className="space-y-2">
        {soci.map(s => {
          const scelto = scelti.has(s.tesseramentoId)
          const incompleto = s.mancanti.length > 0
          return (
            <label
              key={s.tesseramentoId}
              className={`flex items-start gap-3 rounded-2xl border px-4 py-3 cursor-pointer transition-all ${
                scelto
                  ? 'border-yellow-400 bg-yellow-50 shadow-[0_0_0_1px_theme(colors.yellow.400)]'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <input
                type="checkbox"
                checked={scelto}
                onChange={() => commuta(s.tesseramentoId)}
                className="accent-yellow-400 w-4 h-4 shrink-0 mt-1"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gray-900">{s.nominativo}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {s.cf ?? 'codice fiscale mancante'} · tesserato il {formatData(s.firmatoIl)}
                </p>
                {incompleto && (
                  <p className="mt-1.5 rounded-xl bg-red-50 border border-red-200 px-3 py-1.5 text-xs text-red-800">
                    <span className="font-bold">La UISP rifiuterà questa riga:</span>{' '}
                    manca {s.mancanti.join(', ')}.
                  </p>
                )}
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  s.quotaVersata ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {s.quotaVersata ? 'Quota versata' : 'Quota non versata'}
              </span>
            </label>
          )
        })}
      </div>

      {conBuchi.length > 0 && (
        <p className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-800 leading-relaxed">
          Hai selezionato {conBuchi.length} {conBuchi.length === 1 ? 'socio' : 'soci'} con dati
          incompleti. Il modulo si genera lo stesso, ma quelle righe arriveranno vuote in qualche
          colonna: meglio completare la scheda prima di mandarle.
        </p>
      )}

      {errore && <p className="text-red-600 text-xs font-medium pl-1">{errore}</p>}

      <button
        type="button"
        onClick={scarica}
        disabled={inCorso || selezionati.length === 0}
        className="bg-yellow-400 text-gray-900 px-6 py-3.5 rounded-xl font-bold text-sm hover:bg-yellow-500 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed w-full inline-flex items-center justify-center gap-2"
      >
        {inCorso && <Spinner className="h-4 w-4" />}
        {inCorso
          ? 'Preparazione del modulo...'
          : `Scarica il modulo e segna come inviati (${selezionati.length})`}
      </button>
    </div>
  )
}
