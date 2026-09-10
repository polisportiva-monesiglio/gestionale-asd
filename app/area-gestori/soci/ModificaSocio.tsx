'use client'

import { useActionState } from 'react'
import { correggiAnagrafica, type RisultatoCorrezione } from './actions'
import { CAMPI, PERCHE_NIENTE_EMAIL, type Gruppo } from '@/lib/correzioniSoci'
import { Spinner } from '@/app/components/Spinner'

export type SocioDaCorreggere = {
  id: string
  nome: string
  cognome: string
  email: string | null
  telefono: string | null
  luogo_nascita: string | null
  provincia_nascita: string | null
  data_nascita: string | null
  cf: string | null
  indirizzo: string | null
  cap: string | null
  citta: string | null
  provincia_residenza: string | null
  minorenne: boolean | null
  haModuloFirmato: boolean
}

const TITOLI: Record<Gruppo, string> = {
  anagrafica: 'Anagrafica',
  residenza: 'Residenza',
  contatti: 'Contatti',
}

const GRUPPI: Gruppo[] = ['anagrafica', 'residenza', 'contatti']

export function ModificaSocio({
  socio,
  onFatto,
}: {
  socio: SocioDaCorreggere
  onFatto: () => void
}) {
  const [esito, azione, inCorso] = useActionState<RisultatoCorrezione | null, FormData>(
    async (prec, formData) => {
      const r = await correggiAnagrafica(prec, formData)
      if (r.ok) onFatto()
      return r
    },
    null
  )

  return (
    <form action={azione} className="space-y-5">
      <input type="hidden" name="socio_id" value={socio.id} />

      {/* Il modulo firmato non cambia mai, e chi corregge deve saperlo prima
          di premere, non scoprirlo dopo. */}
      {socio.haModuloFirmato && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 leading-relaxed">
          <strong>Il modulo firmato non viene modificato.</strong> Correggere qui sistema
          l&apos;elenco soci, il foglio UISP e le ricevute; il documento che il socio ha firmato
          resta come l&apos;ha firmato. La correzione viene registrata con il tuo nome, così a
          distanza di mesi si capisce perché i due non coincidono.
        </p>
      )}

      {GRUPPI.map(gruppo => {
        const campi = CAMPI.filter(c => c.gruppo === gruppo)
        if (campi.length === 0) return null
        return (
          <div key={gruppo}>
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">
              {TITOLI[gruppo]}
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              {campi.map(campo => {
                const valore = (socio as unknown as Record<string, unknown>)[campo.chiave]
                const errore = !esito?.ok ? esito?.perCampo?.[campo.chiave] : undefined
                return (
                  <div key={campo.chiave} className={campo.chiave === 'indirizzo' ? 'sm:col-span-2' : ''}>
                    <label
                      htmlFor={`c-${socio.id}-${campo.chiave}`}
                      className="block text-xs font-semibold text-gray-600 mb-1"
                    >
                      {campo.etichetta}
                      {campo.delicato && (
                        <span
                          className="ml-1 text-amber-600"
                          title={campo.aiuto}
                        >
                          •
                        </span>
                      )}
                    </label>
                    <input
                      id={`c-${socio.id}-${campo.chiave}`}
                      name={campo.chiave}
                      type={campo.tipo === 'data' ? 'date' : 'text'}
                      defaultValue={valore == null ? '' : String(valore)}
                      // Il limite vale solo per la data di nascita, che è
                      // l'unico campo data qui: una data futura è il refuso
                      // che ha fatto firmare un socio come genitore di sé stesso.
                      max={campo.tipo === 'data' ? new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }) : undefined}
                      className={`w-full px-3 py-2 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        errore ? 'border-red-300 bg-red-50' : 'border-gray-200'
                      }`}
                    />
                    {campo.aiuto && !errore && (
                      <p className="text-[10px] text-gray-400 mt-0.5">{campo.aiuto}</p>
                    )}
                    {errore && <p className="text-[10px] text-red-600 mt-0.5">{errore}</p>}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <div>
        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">Email</p>
        <p className="text-xs text-gray-500 leading-relaxed">
          {socio.email ?? '—'}
          <span className="block text-gray-400 mt-0.5">{PERCHE_NIENTE_EMAIL}</span>
        </p>
      </div>

      <div>
        <label htmlFor={`c-${socio.id}-motivo`} className="block text-xs font-semibold text-gray-600 mb-1">
          Perché lo stai correggendo <span className="font-normal text-gray-400">(facoltativo)</span>
        </label>
        <input
          id={`c-${socio.id}-motivo`}
          name="motivo"
          type="text"
          placeholder="es. il socio aveva scritto il nome in tutti e due i campi"
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-[10px] text-gray-400 mt-0.5">
          Si conserva accanto alla correzione: fra sei mesi è l&apos;unica cosa che la spiega.
        </p>
      </div>

      {esito && (
        <p className={`text-sm ${esito.ok ? 'text-green-700' : 'text-red-600'}`}>
          {esito.ok ? esito.messaggio : esito.errore}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={inCorso}
          className="rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 transition-colors inline-flex items-center gap-2"
        >
          {inCorso && <Spinner className="h-4 w-4" />}
          {inCorso ? 'Salvataggio…' : 'Salva la correzione'}
        </button>
        <button
          type="button"
          onClick={onFatto}
          className="rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-semibold px-4 py-2 transition-colors"
        >
          Chiudi
        </button>
      </div>
    </form>
  )
}
