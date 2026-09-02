'use client'

import { useActionState, useState } from 'react'
import { richiestaAbbonamento, type ActionResult } from './actions'
import { Spinner } from '@/app/components/Spinner'
import {
  periodoAbbonamento,
  formattaGiorno,
  decorrenzeAmmesse,
  acquistabile,
  type InizioScelto,
} from '@/lib/abbonamento'

type Attivita = {
  id: string
  nome_attivita: string
  tipo: string
  prezzo_base: number | null
  durata_mesi: number | null
}

type Props = {
  /** Persona per cui si sta chiedendo il periodo di frequenza. */
  socioId: string
  attivita: Attivita[]
  uispApplicabile: boolean
  /** Serve a fermare i periodi che sforerebbero nella stagione dopo. */
  annoSportivo: string
}

const inputClass =
  'w-full p-3.5 rounded-xl border border-gray-200 shadow-sm transition-all focus:outline-none focus:ring-2 bg-white focus:border-yellow-400 focus:ring-yellow-200 text-gray-800 hover:border-gray-300 text-sm'

export default function RichiestaAbbonamentoForm({
  socioId,
  attivita,
  uispApplicabile,
  annoSportivo,
}: Props) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    richiestaAbbonamento,
    null
  )
  const [selectedId, setSelectedId] = useState('')
  const [inizio, setInizio] = useState<InizioScelto | ''>('')

  if (state?.ok) {
    return (
      <div className="rounded-2xl bg-green-50 border border-green-200 px-5 py-6 text-center">
        <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl font-bold text-green-600">
          ✓
        </div>
        <p className="text-sm font-extrabold text-green-800">Richiesta inviata!</p>
        <p className="text-sm text-green-700 mt-1.5 leading-relaxed">
          La segreteria confermerà il tuo periodo di frequenza a breve.
        </p>
      </div>
    )
  }

  const selected = attivita.find(a => a.id === selectedId)
  const prezzoBase = selected?.prezzo_base ?? null
  const totale = prezzoBase != null ? prezzoBase + (uispApplicabile ? 20 : 0) : null

  // La durata viene dall'attività scelta: un trimestrale dura tre mesi, e da
  // quale mese si contano lo decide il socio qui sotto. Le stesse date le
  // ricalcola il server: questo serve solo a farle vedere prima di inviare.
  const durata = selected?.durata_mesi ?? 0
  const scegliePeriodo = durata >= 1
  const anteprima = scegliePeriodo && inizio ? periodoAbbonamento(inizio, durata) : null

  // Un periodo di frequenza non puo' sfociare nella stagione successiva. Piu' la
  // stagione avanza, piu' le durate lunghe si spengono: prima sparisce la
  // partenza dal mese dopo, poi l'attivita' intera.
  const ammesse = scegliePeriodo
    ? decorrenzeAmmesse(durata, annoSportivo)
    : { mese_corrente: true, mese_successivo: true }

  return (
    <form action={action} className="space-y-5">
      {/* A un accesso possono corrispondere piu' soci: il server deve sapere
          per chi si sta chiedendo, e verifica comunque che sia dei tuoi. */}
      <input type="hidden" name="socio_id" value={socioId} />

      {/* Dropdown attività */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
          Durata
        </label>
        <select
          name="attivita_id"
          required
          value={selectedId}
          onChange={e => {
            setSelectedId(e.target.value)
            // La decorrenza gia' scelta puo' non valere piu' per la nuova
            // durata: meglio farla riscegliere che portarsela dietro.
            setInizio('')
          }}
          className={inputClass}
        >
          <option value="">Seleziona una durata…</option>
          {attivita.map(a => {
            const disponibile = acquistabile(a.durata_mesi ?? 0, annoSportivo)
            return (
              <option key={a.id} value={a.id} disabled={!disponibile}>
                {a.nome_attivita}
                {a.prezzo_base != null ? `  —  €${a.prezzo_base}` : ''}
                {disponibile ? '' : '  —  non disponibile per questa stagione'}
              </option>
            )
          })}
        </select>
      </div>

      {/* Da quando parte. Non c'è più una soglia nel mese che decide al posto
          del socio: chi vuole entrare oggi parte oggi, chi non ha fretta
          aspetta il primo del mese e non perde giorni. */}
      {scegliePeriodo && (
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Da quando vuoi cominciare
          </label>
          <div className="grid gap-2.5">
            {([
              {
                value: 'mese_corrente' as const,
                label: 'Dal mese in corso',
                nota: 'Puoi venire subito. I giorni già passati di questo mese sono compresi nella quota.',
              },
              {
                value: 'mese_successivo' as const,
                label: 'Dal mese successivo',
                nota: 'Non puoi venire in palestra fino alla fine di questo mese, ma non perdi giorni.',
              },
            ]).map(opt => {
              const ammessa = ammesse[opt.value]
              return (
                <label
                  key={opt.value}
                  className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 shadow-sm transition-all ${
                    ammessa
                      ? 'cursor-pointer border-gray-200 bg-white hover:border-yellow-400 has-[:checked]:border-yellow-400 has-[:checked]:bg-yellow-50 has-[:checked]:shadow-[0_0_0_1px_theme(colors.yellow.400)]'
                      : 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-60'
                  }`}
                >
                  <input
                    type="radio"
                    name="inizio"
                    value={opt.value}
                    required
                    disabled={!ammessa}
                    checked={inizio === opt.value}
                    onChange={() => setInizio(opt.value)}
                    className="accent-yellow-400 w-4 h-4 shrink-0 mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-gray-800">{opt.label}</span>
                    <span className="block text-xs text-gray-500 mt-0.5 leading-relaxed">
                      {ammessa
                        ? opt.nota
                        : `Non disponibile: finirebbe oltre il 31 agosto ${annoSportivo.split('/')[1]}, cioè nella stagione successiva.`}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>

          {anteprima && (
            <div className="mt-2.5 rounded-xl bg-gray-50 border border-gray-200 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Periodo di validità
              </p>
              <p className="text-sm font-bold text-gray-900 mt-0.5">
                dal {formattaGiorno(anteprima.dataInizio)} al {formattaGiorno(anteprima.dataFine)}
              </p>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Il periodo finisce sempre a fine mese. La segreteria confermerà queste
                date insieme al pagamento.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Quota annuale di tesseramento: il nome e' quello dell'art. 2 del
          regolamento, non "UISP", che e' solo l'ente che emette la tessera. */}
      {uispApplicabile && (
        <div className="rounded-2xl bg-red-50 border border-red-300 px-4 py-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-base font-extrabold text-red-600">
              !
            </div>
            <div>
              <p className="text-sm font-extrabold text-red-800">
                Primo pagamento della stagione
              </p>
              <p className="text-sm text-red-700 mt-1 leading-relaxed">
                Verrà aggiunta la <strong>quota annuale di tesseramento di €20</strong>,
                comprensiva della copertura assicurativa. Si versa una volta per stagione
                sportiva e non è compresa nel corrispettivo del periodo di frequenza.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Riepilogo totale */}
      {totale !== null && (
        <div className="rounded-2xl bg-white border-2 border-yellow-400 px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Totale da versare in sede
              </p>
              {uispApplicabile && prezzoBase != null && (
                <p className="text-xs text-gray-400 mt-0.5">
                  €{prezzoBase} periodo di frequenza + €20 quota tesseramento
                </p>
              )}
            </div>
            <p className="text-3xl font-extrabold text-gray-900">€{totale}</p>
          </div>
        </div>
      )}

      {/* Metodo di pagamento */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Metodo di pagamento
        </label>
        <div className="grid grid-cols-2 gap-2.5">
          {([
            { value: 'contanti', label: 'Contanti' },
            { value: 'bonifico', label: 'Bonifico' },
            { value: 'carta', label: 'Carta' },
            { value: 'satispay', label: 'Satispay' },
          ] as const).map(opt => (
            <label
              key={opt.value}
              className="relative flex items-center gap-2.5 cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm transition-all hover:border-yellow-400 has-[:checked]:border-yellow-400 has-[:checked]:bg-yellow-50 has-[:checked]:shadow-[0_0_0_1px_theme(colors.yellow.400)]"
            >
              <input
                type="radio"
                name="metodo_pagamento"
                value={opt.value}
                required
                className="accent-yellow-400 w-4 h-4 shrink-0"
              />
              <span className="text-sm font-semibold text-gray-800">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Note */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
          Note{' '}
          <span className="font-normal text-gray-400">(opzionale)</span>
        </label>
        <textarea
          name="note"
          rows={2}
          className={`${inputClass} resize-none`}
        />
      </div>

      {state?.ok === false && (
        <p className="text-red-500 text-xs font-medium pl-1">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending || !selectedId || (scegliePeriodo && !inizio)}
        className="bg-yellow-400 text-gray-900 px-6 py-3.5 rounded-xl font-bold text-sm hover:bg-yellow-500 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed w-full inline-flex items-center justify-center gap-2"
      >
        {pending && <Spinner className="h-4 w-4" />}
        {pending ? 'Invio in corso...' : 'Invia la richiesta'}
      </button>
    </form>
  )
}
