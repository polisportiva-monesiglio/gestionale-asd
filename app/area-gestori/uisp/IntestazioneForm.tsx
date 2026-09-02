'use client'

import { useActionState, useState } from 'react'
import { Spinner } from '@/app/components/Spinner'
import { salvaIntestazioneUisp, type EsitoInvio } from './actions'
import type { IntestazioneUisp } from '@/lib/uisp'

const CAMPI = [
  { nome: 'presidenteCognome', etichetta: 'Cognome del presidente', segnaposto: 'Rossi' },
  { nome: 'presidenteNome', etichetta: 'Nome del presidente', segnaposto: 'Mario' },
  { nome: 'denominazione', etichetta: 'Denominazione', segnaposto: 'A.S.D. Polisportiva Monesiglio' },
  { nome: 'codiceAffiliazione', etichetta: 'Codice Affiliazione UISP', segnaposto: 'lo trovi sulla tessera di affiliazione' },
] as const

export function IntestazioneForm({ intestazione }: { intestazione: IntestazioneUisp }) {
  const [stato, azione, inCorso] = useActionState<EsitoInvio | null, FormData>(salvaIntestazioneUisp, null)
  const mancanti = CAMPI.filter(c => !intestazione[c.nome]).map(c => c.etichetta.toLowerCase())
  const [aperto, setAperto] = useState(mancanti.length > 0)

  return (
    <div>
      <button
        type="button"
        onClick={() => setAperto(v => !v)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center min-w-0">
          <span className={`w-1.5 h-5 rounded-full mr-2.5 shrink-0 ${mancanti.length > 0 ? 'bg-red-400' : 'bg-gray-300'}`} />
          <span className="text-sm font-extrabold text-gray-900 tracking-tight">
            Intestazione del modulo
          </span>
        </span>
        <span className="shrink-0 text-xs font-semibold text-gray-400">{aperto ? 'chiudi' : 'apri'}</span>
      </button>

      <p className="text-xs text-gray-400 mt-1 mb-4 pl-4">
        {mancanti.length > 0
          ? `Il modulo esce con ${mancanti.length === 1 ? 'un campo vuoto' : 'dei campi vuoti'} in alto: manca ${mancanti.join(', ')}.`
          : 'Compare in cima al modulo, sopra l’elenco dei soci.'}
      </p>

      {aperto && (
        <form action={azione} className="space-y-3">
          {CAMPI.map(campo => (
            <div key={campo.nome}>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                {campo.etichetta}
              </label>
              <input
                type="text"
                name={campo.nome}
                defaultValue={intestazione[campo.nome]}
                placeholder={campo.segnaposto}
                maxLength={200}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-yellow-400 focus:ring-4 focus:ring-yellow-100 transition-all"
              />
            </div>
          ))}

          {stato?.ok === false && <p className="text-red-600 text-xs font-medium">{stato.error}</p>}
          {stato?.ok === true && <p className="text-green-700 text-xs font-medium">{stato.message}</p>}

          <button
            type="submit"
            disabled={inCorso}
            className="bg-gray-900 text-white px-5 py-2.5 rounded-xl font-bold text-xs hover:bg-gray-800 transition-all disabled:opacity-50 inline-flex items-center gap-2"
          >
            {inCorso && <Spinner className="h-3.5 w-3.5" />}
            Salva intestazione
          </button>
        </form>
      )}
    </div>
  )
}
