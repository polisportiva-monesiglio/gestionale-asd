'use client'

import { useMemo, useState } from 'react'
import { ListaDecisioni } from '../ListaDecisioni'
import type { Decisione } from '@/lib/storicoDecisioni'
import { ordinaSoci, type Colonna, type Verso } from '@/lib/ordinaSoci'

type Socio = {
  id: string
  nome: string
  cognome: string
  email: string | null
  telefono: string | null
  dataRegistrazione: string | null
  scadenzaCert: string | null
  statoAbbonamento: string | null
  nomeAttivita: string | null
  tesseramentoId: string | null
  haModulo: boolean
  haCertificato: boolean
  nuovoIscritto: boolean
}

function formatData(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function badgeScadenza(scadenza: string | null) {
  if (!scadenza) return { label: 'Mancante', cls: 'bg-gray-100 text-gray-500' }
  const days = Math.ceil((new Date(scadenza).getTime() - Date.now()) / 86400000)
  if (days < 0) return { label: 'Scaduto', cls: 'bg-red-100 text-red-700' }
  if (days <= 30) return { label: `${days}g`, cls: 'bg-yellow-100 text-yellow-700' }
  return { label: 'Valido', cls: 'bg-green-100 text-green-700' }
}

function badgeAbbonamento(stato: string | null) {
  if (!stato) return { label: 'Nessuno', cls: 'bg-gray-100 text-gray-500' }
  if (stato === 'pagato') return { label: 'Pagato', cls: 'bg-green-100 text-green-700' }
  return { label: 'Da saldare', cls: 'bg-yellow-100 text-yellow-700' }
}

/* Le regole di ordinamento stanno in `lib/ordinaSoci.ts`: hanno due eccezioni
   volute (certificato e frequenza si ordinano per urgenza, non per valore) e
   dentro un file di JSX non si potevano provare senza aprire un browser. */

const INTESTAZIONI: { chiave: Colonna; testo: string }[] = [
  { chiave: 'socio', testo: 'Socio' },
  { chiave: 'frequenza', testo: 'Frequenza' },
  { chiave: 'certificato', testo: 'Certificato' },
  { chiave: 'iscritto', testo: 'Iscritto il' },
  { chiave: 'email', testo: 'Email' },
  { chiave: 'telefono', testo: 'Telefono' },
]

/* -------------------------------------------------------------------- */

export function SociList({
  soci,
  decisioniPerSocio = {},
}: {
  soci: Socio[]
  /**
   * Lo storico di ogni socio, già pronto: arriva dalla pagina in una lettura
   * sola invece di una richiesta per riga aperta. Non è filtrato per stagione
   * di proposito — la lista mostra i soci della stagione scelta, ma la storia
   * di una persona non si ferma a fine agosto.
   */
  decisioniPerSocio?: Record<string, Decisione[]>
}) {
  const [query, setQuery] = useState('')
  const [aperto, setAperto] = useState<string | null>(null)
  const [colonna, setColonna] = useState<Colonna>('socio')
  const [verso, setVerso] = useState<Verso>('su')

  function ordinaPer(c: Colonna) {
    if (c === colonna) {
      setVerso(v => (v === 'su' ? 'giu' : 'su'))
      return
    }
    setColonna(c)
    // Cambiando colonna si riparte sempre dal verso naturale: più urgente
    // prima per certificato e frequenza, A–Z o dal più vecchio per le altre.
    // Ereditare il verso della colonna precedente confonde.
    setVerso('su')
  }

  const righe = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('it')
    const filtrati = q
      ? soci.filter(s =>
          `${s.nome} ${s.cognome} ${s.email ?? ''} ${s.telefono ?? ''}`
            .toLocaleLowerCase('it')
            .includes(q)
        )
      : soci
    return ordinaSoci(filtrati, colonna, verso)
  }, [soci, query, colonna, verso])

  const socioAperto = aperto ? soci.find(s => s.id === aperto) ?? null : null
  const storicoAperto = aperto ? decisioniPerSocio[aperto] ?? [] : []

  return (
    <>
      <div className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100 p-4 sm:p-5">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Cerca per nome, email o telefono…"
          className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100 border-t-[6px] border-t-blue-600 overflow-hidden">
        {righe.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10 px-6">
            {soci.length === 0 ? 'Nessun socio trovato.' : 'Nessun risultato per questa ricerca.'}
          </p>
        ) : (
          <>
            {/* Su un telefono la tabella non ci sta, e stringerla renderebbe
                illeggibile ogni colonna. Scorre in orizzontale dentro il
                proprio riquadro — la pagina no — e la colonna del nome resta
                ferma a sinistra: scorrendo verso destra, senza, non si sa più
                di chi è la riga che si sta guardando. */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    {INTESTAZIONI.map((h, i) => {
                      const attiva = colonna === h.chiave
                      return (
                        <th
                          key={h.chiave}
                          scope="col"
                          aria-sort={attiva ? (verso === 'su' ? 'ascending' : 'descending') : 'none'}
                          className={`text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${
                            attiva ? 'text-blue-700' : 'text-gray-500'
                          } ${i === 0 ? 'sticky left-0 z-20 bg-gray-50' : ''}`}
                        >
                          <button
                            type="button"
                            onClick={() => ordinaPer(h.chiave)}
                            className="w-full text-left px-3 py-2.5 hover:text-blue-700 transition-colors"
                          >
                            {h.testo}
                            <span className={`ml-1 ${attiva ? '' : 'text-gray-300'}`}>
                              {attiva ? (verso === 'su' ? '▲' : '▼') : '↕'}
                            </span>
                          </button>
                        </th>
                      )
                    })}
                    <th
                      scope="col"
                      className="text-[10px] font-bold uppercase tracking-wide text-gray-500 px-3 py-2.5 whitespace-nowrap"
                    >
                      Documenti
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {righe.map(s => {
                    const certBadge = badgeScadenza(s.scadenzaCert)
                    const abBadge = badgeAbbonamento(s.statoAbbonamento)
                    const storico = decisioniPerSocio[s.id] ?? []
                    const apertoQui = aperto === s.id

                    return (
                      <tr
                        key={s.id}
                        className={`border-b border-gray-100 last:border-0 align-top ${
                          apertoQui ? 'bg-blue-50/50' : 'hover:bg-gray-50/60'
                        }`}
                      >
                        <td className={`px-3 py-3 sticky left-0 z-10 ${apertoQui ? 'bg-[#F4F8FF]' : 'bg-white'}`}>
                          <p className="font-bold text-sm text-gray-900 whitespace-nowrap">
                            {s.cognome} {s.nome}
                          </p>
                          {s.nuovoIscritto && (
                            <span className="inline-block mt-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-blue-100 text-blue-700">
                              🆕 Nuovo iscritto
                            </span>
                          )}
                          {storico.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setAperto(apertoQui ? null : s.id)}
                              aria-expanded={apertoQui}
                              className="block mt-1 text-[10px] font-semibold text-gray-500 hover:text-blue-700 transition-colors whitespace-nowrap"
                            >
                              {apertoQui ? '▾' : '▸'} Storico ({storico.length})
                            </button>
                          )}
                        </td>

                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${abBadge.cls}`}>
                            {abBadge.label}
                          </span>
                          {s.nomeAttivita && (
                            <p className="text-[10px] text-gray-400 mt-1">{s.nomeAttivita}</p>
                          )}
                        </td>

                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${certBadge.cls}`}>
                            {certBadge.label}
                          </span>
                          {s.scadenzaCert && (
                            <p className="text-[10px] text-gray-400 mt-1">{formatData(s.scadenzaCert)}</p>
                          )}
                        </td>

                        <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {formatData(s.dataRegistrazione)}
                        </td>

                        <td className="px-3 py-3 text-xs text-gray-500">
                          {s.email ? (
                            <a href={`mailto:${s.email}`} className="hover:text-blue-700 transition-colors">
                              {s.email}
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>

                        <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {s.telefono ? (
                            <a href={`tel:${s.telefono}`} className="hover:text-blue-700 transition-colors">
                              {s.telefono}
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>

                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className="flex gap-1.5">
                            {s.tesseramentoId && s.haModulo && (
                              <a
                                href={`/api/modulo-download?tesseramento_id=${encodeURIComponent(s.tesseramentoId)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Modulo firmato"
                                aria-label={`Modulo firmato di ${s.cognome} ${s.nome}`}
                                className="text-xs px-2 py-1 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 hover:bg-blue-100 transition-colors"
                              >
                                📄
                              </a>
                            )}
                            {s.tesseramentoId && s.haCertificato && (
                              <a
                                href={`/api/certificato-download?tesseramento_id=${encodeURIComponent(s.tesseramentoId)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Certificato medico"
                                aria-label={`Certificato medico di ${s.cognome} ${s.nome}`}
                                className="text-xs px-2 py-1 bg-green-50 border border-green-200 rounded-lg text-green-700 hover:bg-green-100 transition-colors"
                              >
                                🩺
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Lo storico aperto sta sotto la tabella e non dentro una riga:
                dentro seguirebbe lo scorrimento orizzontale e scivolerebbe
                fuori schermo proprio mentre lo si legge. */}
            {socioAperto && storicoAperto.length > 0 && (
              <div className="border-t border-gray-200 bg-gray-50 p-4 sm:p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2.5">
                  Storico richieste — {socioAperto.cognome} {socioAperto.nome}
                </p>
                <ListaDecisioni decisioni={storicoAperto} mostraSocio={false} />
              </div>
            )}
          </>
        )}
      </div>

      <p className="text-[11px] text-gray-400 px-2">
        {righe.length} {righe.length === 1 ? 'socio' : 'soci'}
        {query ? ` su ${soci.length}` : ''} · tocca l&apos;intestazione di una colonna per ordinare
      </p>
    </>
  )
}
