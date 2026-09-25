'use client'

import { useRef, useState } from 'react'
import { registraCertificato, type ActionResult } from './actions'
import { Spinner } from '@/app/components/Spinner'
import { CERTIFICATO_ACCETTATI, MAX_CERTIFICATO } from '@/lib/certificatoFile'
import { permessoDiCaricare, type PermessoRicordato } from '@/lib/caricaCertificato'
import { supabase } from '@/lib/supabase'

const inputClass = 'w-full p-3.5 rounded-xl border border-gray-200 shadow-sm transition-all focus:outline-none focus:ring-2 bg-white focus:border-yellow-400 focus:ring-yellow-200 text-gray-800 hover:border-gray-300 text-sm'

/**
 * Il caricamento del certificato dall'area socio.
 *
 * ⚠️ Il file **non passa dal server**: va diritto all'archivio con un permesso
 * firmato, e al server arriva solo il percorso. Prima passava dentro la
 * richiesta dell'azione, e un PDF scansionato la faceva morire prima del
 * codice, col browser che diceva soltanto «This page couldn't load». Stesso
 * giro che fa il rinnovo completo in `RinnovoTesseramento`.
 *
 * Per questo il modulo non usa `useActionState` con `action=`: i tre passi —
 * permesso, caricamento, registrazione — vanno fatti in fila e ognuno può
 * fallire per conto suo, con un messaggio che dica quale.
 */
export default function UploadCertificatoForm({ socioId, hasExisting }: { socioId: string; hasExisting: boolean }) {
  const [stato, setStato] = useState<ActionResult | null>(null)
  const [inCorso, setInCorso] = useState(false)
  // Il permesso costa uno slot del limitatore: se il caricamento si interrompe
  // e la persona riprova con lo stesso file, si riusa quello gia' avuto.
  const permesso = useRef<PermessoRicordato>(null)

  async function invia(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const modulo = e.currentTarget
    const dati = new FormData(modulo)
    const file = dati.get('file') as File | null
    const dataCertificato = (dati.get('data_certificato') as string | null) ?? ''

    if (!file || file.size === 0) {
      setStato({ ok: false, error: 'Seleziona il file del certificato.' })
      return
    }
    if (!dataCertificato) {
      setStato({ ok: false, error: 'Inserisci la data del certificato.' })
      return
    }
    if (file.size > MAX_CERTIFICATO) {
      setStato({ ok: false, error: 'Il file supera la dimensione massima di 10MB.' })
      return
    }

    setStato(null)
    setInCorso(true)
    try {
      const rilascio = await permessoDiCaricare(file, permesso)

      const { error } = await supabase.storage
        .from('certificati-medici')
        .uploadToSignedUrl(rilascio.percorso, rilascio.token, file)

      if (error) {
        setStato({ ok: false, error: `Caricamento fallito: ${error.message}` })
        return
      }

      const daRegistrare = new FormData()
      daRegistrare.set('socio_id', socioId)
      daRegistrare.set('percorso', rilascio.percorso)
      daRegistrare.set('data_certificato', dataCertificato)
      setStato(await registraCertificato(null, daRegistrare))
    } catch (errore) {
      setStato({ ok: false, error: errore instanceof Error ? errore.message : 'Caricamento non riuscito.' })
    } finally {
      setInCorso(false)
    }
  }

  if (stato?.ok) {
    return (
      <div className="rounded-2xl bg-green-50 border border-green-200 px-5 py-4">
        <p className="text-sm font-semibold text-green-700">
          Certificato aggiornato con successo.
        </p>
        <p className="text-sm text-green-600 mt-1">
          La segreteria potrà verificarlo al tuo prossimo accesso in sede.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={invia} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Documento (PDF o foto)
          </label>
          <input
            name="file"
            type="file"
            accept={CERTIFICATO_ACCETTATI}
            required
            className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-yellow-400 file:text-gray-900 hover:file:bg-yellow-500 file:transition-colors file:cursor-pointer cursor-pointer"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Data del certificato
          </label>
          <input
            name="data_certificato"
            type="date"
            required
            className={inputClass}
          />
        </div>
      </div>

      {stato?.ok === false && (
        <p className="text-red-500 text-xs font-medium pl-1">{stato.error}</p>
      )}

      <div className="flex justify-center">
        <button
          type="submit"
          disabled={inCorso}
          className="bg-yellow-400 text-gray-900 px-8 py-3.5 rounded-xl font-bold text-sm hover:bg-yellow-500 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
        >
          {inCorso && <Spinner className="h-4 w-4" />}
          {inCorso
            ? 'Caricamento in corso...'
            : hasExisting
              ? 'Rinnova certificato'
              : 'Carica certificato'}
        </button>
      </div>
    </form>
  )
}
