'use client'

import { useMemo, useState } from 'react'
import { ListaDecisioni } from '../ListaDecisioni'
import type { Decisione } from '@/lib/storicoDecisioni'
import { ordinaSoci, type Colonna, type Verso } from '@/lib/ordinaSoci'
import {
  filtraSoci, statoCertificato, quantiFiltriAttivi, FILTRI_VUOTI,
  VOCI_FREQUENZA, VOCI_CERTIFICATO, VOCI_ISCRITTO, type Filtri,
} from '@/lib/filtraSoci'
import { giorniAllaScadenza } from '@/lib/analisi'
import { ModificaSocio, type SocioDaCorreggere } from './ModificaSocio'

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
  daCorreggere: SocioDaCorreggere
}

function formatData(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Quello che scrive la pastiglia e quello per cui filtra l'elenco a tendina
// vengono dalla **stessa** funzione: erano due conti separati sullo stesso
// dato, ed e' il modo classico in cui una tabella comincia a mentire — filtri
// "Scaduto" e ti restano righe che dicono "Valido".
function badgeScadenza(scadenza: string | null) {
  switch (statoCertificato(scadenza)) {
    case 'mancante':
      return { label: 'Mancante', cls: 'bg-gray-100 text-gray-500' }
    case 'scaduto':
      return { label: 'Scaduto', cls: 'bg-red-100 text-red-700' }
    case 'in_scadenza':
      return { label: `${giorniAllaScadenza(scadenza as string)}g`, cls: 'bg-yellow-100 text-yellow-700' }
    default:
      return { label: 'Valido', cls: 'bg-green-100 text-green-700' }
  }
}

function badgeAbbonamento(stato: string | null) {
  if (!stato) return { label: 'Nessuno', cls: 'bg-gray-100 text-gray-500' }
  if (stato === 'pagato') return { label: 'Pagato', cls: 'bg-green-100 text-green-700' }
  return { label: 'Da saldare', cls: 'bg-yellow-100 text-yellow-700' }
}

/* Le regole di ordinamento stanno in `lib/ordinaSoci.ts`: hanno due eccezioni
   volute (certificato e frequenza si ordinano per urgenza, non per valore) e
   dentro un file di JSX non si potevano provare senza aprire un browser. */

const CLASSE_FILTRO =
  'w-full min-w-[7rem] px-2 py-1.5 text-xs font-normal border border-gray-200 rounded-lg bg-white ' +
  'text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500'

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
  const [aperto, setAperto] = useState<string | null>(null)
  const [colonna, setColonna] = useState<Colonna>('socio')
  const [verso, setVerso] = useState<Verso>('su')
  const [filtri, setFiltri] = useState<Filtri>(FILTRI_VUOTI)
  // La riga dei filtri sta nascosta finche' non serve: su venti soci la si usa
  // di rado, e sei caselle sempre aperte sopra la tabella la allontanano.
  const [mostraFiltri, setMostraFiltri] = useState(false)
  // Una riga per volta: due moduli di correzione aperti insieme sono due modi
  // di perdere quello che si stava scrivendo nell'altro.
  const [inCorrezione, setInCorrezione] = useState<string | null>(null)

  const attivi = quantiFiltriAttivi(filtri)
  const cambia = (campo: keyof Filtri, valore: string) =>
    setFiltri(f => ({ ...f, [campo]: valore }) as Filtri)

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

  const righe = useMemo(
    () => ordinaSoci(filtraSoci(soci, filtri), colonna, verso),
    [soci, filtri, colonna, verso]
  )

  const socioAperto = aperto ? soci.find(s => s.id === aperto) ?? null : null
  const socioInCorrezione = inCorrezione ? soci.find(s => s.id === inCorrezione) ?? null : null
  const storicoAperto = aperto ? decisioniPerSocio[aperto] ?? [] : []

  return (
    <>
      <div className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100 p-4 sm:p-5">
        <div className="flex gap-2">
          <input
            type="text"
            value={filtri.ovunque}
            onChange={e => cambia('ovunque', e.target.value)}
            placeholder="Cerca per nome, email o telefono…"
            className="flex-1 min-w-0 px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={() => setMostraFiltri(v => !v)}
            aria-expanded={mostraFiltri}
            className={`shrink-0 px-3 py-2.5 text-sm font-semibold rounded-xl border transition-colors ${
              attivi > 0
                ? 'border-blue-300 bg-blue-50 text-blue-700'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            Filtri{attivi > 0 ? ` (${attivi})` : ''}
          </button>
          {/* Il pulsante per azzerare compare **solo con un filtro acceso**, e
              accanto al conteggio: e' la via d'uscita da "la lista e' vuota e
              non capisco perche'". */}
          {attivi > 0 && (
            <button
              type="button"
              onClick={() => setFiltri(FILTRI_VUOTI)}
              className="shrink-0 px-3 py-2.5 text-sm font-semibold rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
            >
              Azzera
            </button>
          )}
        </div>
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

                  {/* La riga dei filtri sta **dentro la tabella, sotto le
                      intestazioni**: ogni controllo cade nella colonna che
                      filtra, e scorre insieme a lei. Sopra la tabella
                      avrebbe voluto dire ripetere il nome di ogni colonna
                      accanto alla sua casella. */}
                  {mostraFiltri && (
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th scope="col" className="sticky left-0 z-20 bg-gray-50 px-3 pb-2.5 font-normal">
                        <input
                          type="text"
                          value={filtri.socio}
                          onChange={e => cambia('socio', e.target.value)}
                          placeholder="Cognome"
                          aria-label="Filtra per cognome o nome"
                          className={CLASSE_FILTRO}
                        />
                      </th>

                      <th scope="col" className="px-3 pb-2.5 font-normal">
                        <select
                          value={filtri.frequenza}
                          onChange={e => cambia('frequenza', e.target.value)}
                          aria-label="Filtra per stato della frequenza"
                          className={CLASSE_FILTRO}
                        >
                          <option value="">Tutte</option>
                          {VOCI_FREQUENZA.map(v => (
                            <option key={v.valore} value={v.valore}>{v.testo}</option>
                          ))}
                        </select>
                      </th>

                      <th scope="col" className="px-3 pb-2.5 font-normal">
                        <select
                          value={filtri.certificato}
                          onChange={e => cambia('certificato', e.target.value)}
                          aria-label="Filtra per stato del certificato"
                          className={CLASSE_FILTRO}
                        >
                          <option value="">Tutti</option>
                          {VOCI_CERTIFICATO.map(v => (
                            <option key={v.valore} value={v.valore}>{v.testo}</option>
                          ))}
                        </select>
                      </th>

                      <th scope="col" className="px-3 pb-2.5 font-normal">
                        <select
                          value={filtri.iscritto}
                          onChange={e => cambia('iscritto', e.target.value)}
                          aria-label="Filtra per data di iscrizione"
                          className={CLASSE_FILTRO}
                        >
                          <option value="">Da sempre</option>
                          {VOCI_ISCRITTO.map(v => (
                            <option key={v.valore} value={v.valore}>{v.testo}</option>
                          ))}
                        </select>
                      </th>

                      <th scope="col" className="px-3 pb-2.5 font-normal">
                        <input
                          type="text"
                          value={filtri.email}
                          onChange={e => cambia('email', e.target.value)}
                          placeholder="Indirizzo"
                          aria-label="Filtra per email"
                          className={CLASSE_FILTRO}
                        />
                      </th>

                      <th scope="col" className="px-3 pb-2.5 font-normal">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={filtri.telefono}
                          onChange={e => cambia('telefono', e.target.value)}
                          placeholder="Numero"
                          aria-label="Filtra per telefono"
                          className={CLASSE_FILTRO}
                        />
                      </th>

                      {/* I documenti non si filtrano: sono due bottoni, non un
                          valore. */}
                      <th scope="col" className="px-3 pb-2.5" />
                    </tr>
                  )}
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
                          <button
                            type="button"
                            onClick={() => {
                              setInCorrezione(inCorrezione === s.id ? null : s.id)
                              setAperto(null)
                            }}
                            aria-expanded={inCorrezione === s.id}
                            className="block mt-1 text-[10px] font-semibold text-gray-500 hover:text-blue-700 transition-colors whitespace-nowrap"
                          >
                            {inCorrezione === s.id ? '▾' : '▸'} Correggi i dati
                          </button>
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
            {socioInCorrezione && (
              <div className="border-t border-gray-200 bg-gray-50 p-4 sm:p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-3">
                  Correggi i dati — {socioInCorrezione.cognome} {socioInCorrezione.nome}
                </p>
                <ModificaSocio
                  socio={socioInCorrezione.daCorreggere}
                  onFatto={() => setInCorrezione(null)}
                />
              </div>
            )}

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
        {attivi > 0 ? ` su ${soci.length}, con ${attivi} ${attivi === 1 ? 'filtro' : 'filtri'}` : ''}
        {' · tocca l’intestazione di una colonna per ordinare'}
      </p>
    </>
  )
}
