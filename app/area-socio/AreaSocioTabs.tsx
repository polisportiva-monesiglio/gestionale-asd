'use client'

import { useState } from 'react'
import UploadCertificatoForm from './UploadCertificatoForm'
import RichiestaAbbonamentoForm from './RichiestaAbbonamentoForm'
import { etichettaInizio, formattaGiorno } from '@/lib/abbonamento'

export type AbbonamentoFlat = {
  id: string
  stato_pagamento: string
  importo_tesseramento_uisp: number | null
  note_socio: string | null
  data_acquisto: string | null
  inizio_scelto: string | null
  data_inizio_validita: string | null
  data_fine_validita: string | null
  motivo_rifiuto: string | null
  nome_attivita: string | null
  prezzo_base: number | null
  ricevutaId: string | null
  numeroRicevuta: string | null
}

export type AttivitaOption = {
  id: string
  nome_attivita: string
  tipo: string
  prezzo_base: number | null
  durata_mesi: number | null
}

export type StoricoCertificato = {
  id: string
  dataScadenza: string | null
  caricatoIl: string
  url: string | null
}

type Props = {
  /** Persona a cui si riferisce quello che si vede e si invia da qui. */
  socioId: string
  tesseramento: {
    id: string
    data_scadenza_certificato: string | null
    url_certificato_pdf: string | null
  } | null
  certificatoUrl: string | null
  storicoCertificati: StoricoCertificato[]
  abbonamenti: AbbonamentoFlat[]
  attivita: AttivitaOption[]
  hasPending: boolean
  uispApplicabile: boolean
  annoSportivo: string
}

function formatData(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function statoScadenza(scadenza: string | null | undefined) {
  if (!scadenza) return 'mancante' as const
  return new Date(scadenza) >= new Date() ? 'valido' as const : 'scaduto' as const
}

export default function AreaSocioTabs({
  socioId,
  tesseramento,
  certificatoUrl,
  storicoCertificati,
  abbonamenti,
  attivita,
  hasPending,
  uispApplicabile,
  annoSportivo,
}: Props) {
  const [tab, setTab] = useState<'certificato' | 'abbonamento'>('certificato')
  const scadenza = statoScadenza(tesseramento?.data_scadenza_certificato)

  return (
    <>
      {/* Tab switcher */}
      <div className="flex gap-1.5 mb-8 bg-gray-100 p-1 rounded-2xl">
        {([
          { key: 'certificato', label: 'Certificato medico' },
          { key: 'abbonamento', label: 'Abbonamento' },
        ] as const).map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex-1 py-3 px-2 rounded-xl text-sm font-bold transition-all ${
              tab === t.key
                ? 'bg-yellow-400 text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: Certificato medico ─────────────────────── */}
      {tab === 'certificato' && (
        <div className="space-y-6">
          {!tesseramento ? (
            <div className="text-center py-10">
              <p className="text-sm text-gray-500 leading-relaxed">
                Per questa stagione non risulta un tesseramento attivo nel sistema.
                <br />
                Contatta la segreteria per maggiori informazioni.
              </p>
            </div>
          ) : (
            <>
              {/* Stato attuale */}
              {scadenza === 'valido' && (
                <div className="rounded-2xl bg-green-50 border border-green-200 px-6 py-8 text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl font-bold text-green-600">
                    ✓
                  </div>
                  <p className="text-base font-extrabold text-green-800">Certificato valido</p>
                  <p className="text-sm text-green-600 mt-1.5">
                    Valido fino al{' '}
                    <span className="font-bold">
                      {formatData(tesseramento.data_scadenza_certificato)}
                    </span>
                  </p>
                  {certificatoUrl && (
                    <a
                      href={certificatoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 mt-4 underline underline-offset-2"
                    >
                      ↗ Visualizza il documento caricato
                    </a>
                  )}
                </div>
              )}

              {scadenza === 'scaduto' && (
                <div className="rounded-2xl bg-red-50 border border-red-200 px-6 py-8 text-center">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl font-extrabold text-red-500">
                    !
                  </div>
                  <p className="text-base font-extrabold text-red-800">Certificato scaduto</p>
                  <p className="text-sm text-red-600 mt-1.5">
                    Scaduto il{' '}
                    <span className="font-bold">
                      {formatData(tesseramento.data_scadenza_certificato)}
                    </span>
                  </p>
                  <p className="text-xs text-red-500 mt-2 font-medium">
                    Carica il certificato aggiornato per poter accedere alle attività.
                  </p>
                </div>
              )}

              {scadenza === 'mancante' && (
                <div className="rounded-2xl bg-yellow-50 border border-yellow-200 px-6 py-8 text-center">
                  <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl text-yellow-500">
                    ↑
                  </div>
                  <p className="text-base font-extrabold text-yellow-800">
                    Nessun certificato caricato
                  </p>
                  <p className="text-sm text-yellow-700 mt-1.5 leading-relaxed">
                    Carica il tuo certificato medico per completare il tesseramento.
                  </p>
                </div>
              )}

              {/* Form upload */}
              <div className="bg-gray-50 rounded-2xl p-5 sm:p-6">
                <div className="flex items-center mb-1">
                  <div className="w-1.5 h-5 bg-yellow-400 rounded-full mr-2.5 shrink-0" />
                  <h3 className="text-sm font-extrabold text-gray-900 tracking-tight">
                    {tesseramento.url_certificato_pdf
                      ? 'Rinnova il certificato'
                      : 'Carica il tuo certificato'}
                  </h3>
                </div>
                <p className="text-xs text-gray-400 mb-5 pl-4">
                  Salva il certificato in formato PDF e inserisci la data di emissione
                  riportata sul documento. La scadenza viene calcolata automaticamente (+1 anno).
                </p>
                <UploadCertificatoForm socioId={socioId} hasExisting={!!tesseramento.url_certificato_pdf} />
              </div>

              {/* Storico caricamenti precedenti */}
              {storicoCertificati.length > 0 && (
                <div className="pt-2">
                  <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wide mb-3">
                    Storico caricamenti
                  </h3>
                  <div className="space-y-2">
                    {storicoCertificati.map(c => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="text-xs text-gray-600">
                            Caricato il {formatData(c.caricatoIl)}
                          </p>
                          <p className="text-xs text-gray-400">
                            Scadenza: {formatData(c.dataScadenza)}
                          </p>
                        </div>
                        {c.url && (
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-xs font-semibold text-gray-500 underline underline-offset-2 hover:text-gray-700"
                          >
                            ↗ Visualizza
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── TAB 2: Abbonamento ───────────────────────────── */}
      {tab === 'abbonamento' && (
        <div className="space-y-5">

          {/* Blocco richiesta: sempre in alto, è l'azione principale del tab */}
          {hasPending ? (
            <div className="rounded-2xl bg-yellow-50 border border-yellow-200 px-5 py-6 text-center">
              <p className="text-sm font-extrabold text-yellow-800">
                Richiesta in attesa di conferma
              </p>
              <p className="text-sm text-yellow-700 mt-2 leading-relaxed">
                La segreteria confermerà il tuo abbonamento a breve.
              </p>
            </div>
          ) : (
            <>
              {attivita.length > 0 ? (
                <div className="bg-gray-50 rounded-2xl p-5 sm:p-6">
                  <div className="flex items-center mb-1">
                    <div className="w-1.5 h-5 bg-yellow-400 rounded-full mr-2.5 shrink-0" />
                    <h3 className="text-sm font-extrabold text-gray-900 tracking-tight">
                      {abbonamenti.length > 0
                        ? 'Richiedi un nuovo abbonamento'
                        : 'Scegli il tuo abbonamento'}
                    </h3>
                  </div>
                  <p className="text-xs text-gray-400 mb-5 pl-4">
                    Scegli l&apos;abbonamento e il metodo di pagamento. Riceverai conferma dalla segreteria.
                  </p>
                  <RichiestaAbbonamentoForm
                    socioId={socioId}
                    attivita={attivita}
                    uispApplicabile={uispApplicabile}
                  />
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-4">
                  Nessun abbonamento disponibile al momento. Contatta la segreteria.
                </p>
              )}
            </>
          )}

          {/* Storico abbonamenti stagione corrente */}
          {abbonamenti.length === 0 ? (
            <p className="text-sm text-gray-400 text-center">
              Non hai ancora un abbonamento per la stagione {annoSportivo}.
            </p>
          ) : (
            <div className="space-y-3">
              <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wide">
                Storico abbonamenti
              </h3>
              {abbonamenti.map(ab => {
                const totale = (ab.prezzo_base ?? 0) + Number(ab.importo_tesseramento_uisp ?? 0)
                const isPagato = ab.stato_pagamento === 'pagato'
                const isRifiutato = ab.stato_pagamento === 'rifiutato'
                const cornice = isRifiutato
                  ? 'border-red-200 bg-red-50'
                  : isPagato
                    ? 'border-green-200 bg-green-50'
                    : 'border-yellow-200 bg-yellow-50'
                return (
                  <div key={ab.id} className={`rounded-2xl border p-4 ${cornice}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900">
                          {ab.nome_attivita ?? '—'}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Richiesto il {formatData(ab.data_acquisto)}
                          {isPagato ? null : (
                            <>
                              {' · '}
                              <span className="font-semibold text-gray-700">
                                Totale: €{totale}
                              </span>
                              {Number(ab.importo_tesseramento_uisp) > 0 && (
                                <span className="text-gray-400">
                                  {' '}(incl. €{ab.importo_tesseramento_uisp} UISP)
                                </span>
                              )}
                            </>
                          )}
                        </p>
                        {ab.data_inizio_validita && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            Valido dal {formattaGiorno(ab.data_inizio_validita)} al{' '}
                            {formattaGiorno(ab.data_fine_validita)}
                            <span className="text-gray-400">
                              {' '}({etichettaInizio(ab.inizio_scelto).toLowerCase()})
                            </span>
                          </p>
                        )}
                        {isRifiutato && ab.motivo_rifiuto && (
                          <p className="mt-2 rounded-xl bg-white border border-red-200 px-3 py-2 text-xs text-red-800 leading-relaxed">
                            <span className="font-bold block mb-0.5">Perché è stata rifiutata</span>
                            {ab.motivo_rifiuto}
                            <span className="block mt-1 text-red-600">
                              Puoi inviare una nuova richiesta correggendo quanto indicato.
                            </span>
                          </p>
                        )}
                        {isPagato && ab.ricevutaId && (
                          <a
                            href={`/api/ricevuta-download?abbonamento_id=${encodeURIComponent(ab.id)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block mt-1.5 text-xs font-semibold text-green-700 underline underline-offset-2"
                          >
                            ↗ Scarica ricevuta
                            {ab.numeroRicevuta ? ` (${ab.numeroRicevuta})` : ''}
                          </a>
                        )}
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                          isRifiutato
                            ? 'bg-red-200 text-red-800'
                            : isPagato
                              ? 'bg-green-200 text-green-800'
                              : 'bg-yellow-200 text-yellow-800'
                        }`}
                      >
                        {isRifiutato ? 'Rifiutata' : isPagato ? 'Pagato ✓' : 'In attesa'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </>
  )
}
