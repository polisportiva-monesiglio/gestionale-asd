'use client'

import { useMemo, useState } from 'react'

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

export function SociList({ soci }: { soci: Socio[] }) {
  const [query, setQuery] = useState('')

  const filtrati = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return soci
    return soci.filter(s => `${s.nome} ${s.cognome}`.toLowerCase().includes(q))
  }, [soci, query])

  return (
    <>
      <div className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100 p-4 sm:p-5">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Cerca per nome o cognome…"
          className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl border border-gray-100 border-t-[6px] border-t-blue-600 p-6 sm:p-8">
        {filtrati.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">
            {soci.length === 0 ? 'Nessun socio trovato.' : 'Nessun risultato per questa ricerca.'}
          </p>
        ) : (
          <div className="space-y-3">
            {filtrati.map(s => {
              const certBadge = badgeScadenza(s.scadenzaCert)
              const abBadge = badgeAbbonamento(s.statoAbbonamento)
              return (
                <div key={s.id} className="rounded-2xl border border-gray-100 px-4 py-3 bg-gray-50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-gray-900 flex items-center gap-1.5">
                        {s.cognome} {s.nome}
                        {s.nuovoIscritto && (
                          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-blue-100 text-blue-700 shrink-0">
                            🆕 Nuovo iscritto
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{s.email ?? '—'}</p>
                      {s.telefono && <p className="text-xs text-gray-400">{s.telefono}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${abBadge.cls}`}>
                        {abBadge.label}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${certBadge.cls}`}>
                        Cert. {certBadge.label}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {s.nomeAttivita && (
                      <span className="text-[10px] px-2 py-0.5 bg-white border border-gray-200 rounded-lg text-gray-500">
                        {s.nomeAttivita}
                      </span>
                    )}
                    <span className="text-[10px] px-2 py-0.5 bg-white border border-gray-200 rounded-lg text-gray-400">
                      Iscritto il {formatData(s.dataRegistrazione)}
                    </span>
                    {s.scadenzaCert && (
                      <span className="text-[10px] px-2 py-0.5 bg-white border border-gray-200 rounded-lg text-gray-400">
                        Cert. scade {formatData(s.scadenzaCert)}
                      </span>
                    )}
                    {s.tesseramentoId && (
                      <a
                        href={`/api/modulo-download?tesseramento_id=${encodeURIComponent(s.tesseramentoId)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] px-2 py-0.5 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 font-semibold hover:bg-blue-100 transition-colors"
                      >
                        📄 Modulo firmato
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
