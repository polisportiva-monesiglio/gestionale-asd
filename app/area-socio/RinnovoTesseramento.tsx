'use client'

import { useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Spinner } from '@/app/components/Spinner'
import { permessoDiCaricare, type PermessoRicordato } from '@/lib/caricaCertificato'

export type SocioDaRinnovare = {
  id: string
  nome: string | null
  cognome: string | null
  cf: string | null
  data_nascita: string | null
  luogo_nascita: string | null
  indirizzo: string | null
  cap: string | null
  citta: string | null
  provincia_residenza: string | null
  telefono: string | null
  email: string | null
  minorenne: boolean | null
  genitore_nome: string | null
  genitore_cognome: string | null
  genitore_email: string | null
  genitore_contatto_preferito: string | null
  genitore_recapito: string | null
}

type Props = {
  socio: SocioDaRinnovare
  annoSportivo: string
  /** Scadenza del certificato ancora valido, se ce n'è uno da riusare. */
  certificatoValidoFinoAl: string | null
}

const inputClass =
  'w-full p-3 rounded-xl border border-gray-200 shadow-sm transition-all focus:outline-none focus:ring-2 bg-white focus:border-yellow-400 focus:ring-yellow-200 text-gray-800 text-sm'

function giorno(iso: string | null): string {
  if (!iso) return '—'
  const [a, m, g] = iso.split('-')
  return a && m && g ? `${g}/${m}/${a}` : '—'
}

export default function RinnovoTesseramento({ socio, annoSportivo, certificatoValidoFinoAl }: Props) {
  const minorenne = socio.minorenne === true

  const [modifiche, setModifiche] = useState({
    indirizzoResidenza: socio.indirizzo ?? '',
    capResidenza: socio.cap ?? '',
    cittaResidenza: socio.citta ?? '',
    provinciaResidenza: socio.provincia_residenza ?? '',
    telefono: socio.telefono ?? '',
    email: socio.email ?? '',
    genitoreNome: socio.genitore_nome ?? '',
    genitoreCognome: socio.genitore_cognome ?? '',
    genitoreEmail: socio.genitore_email ?? '',
    genitoreContattoScelta: socio.genitore_contatto_preferito ?? 'whatsapp',
    genitoreContatto: socio.genitore_recapito ?? '',
  })

  const [consensi, setConsensi] = useState({
    dichiarazioneSalute: false,
    accettazioneStatutoRegolamento: false,
    presaAttoVideosorveglianza: false,
    presaAttoInformativa: false,
    consensoCertificatoMedico: false,
    consensoImmagini: false,
  })

  const [riusaCertificato, setRiusaCertificato] = useState(certificatoValidoFinoAl !== null)
  const [file, setFile] = useState<File | null>(null)
  const [dataCertificato, setDataCertificato] = useState('')

  const [token, setToken] = useState('')
  const [inviatoA, setInviatoA] = useState('')
  const [istantanea, setIstantanea] = useState('')
  const [codice, setCodice] = useState('')
  const [inCorso, setInCorso] = useState(false)
  // Il permesso sopravvive ai ritentativi: chiederne un altro per lo stesso file
  // consumerebbe un secondo slot del limitatore.
  const permessoCaricamento = useRef<PermessoRicordato>(null)
  const [errore, setErrore] = useState('')
  const [fatto, setFatto] = useState<{ url: string | null } | null>(null)

  const obbligatoriSpuntati =
    consensi.dichiarazioneSalute &&
    consensi.accettazioneStatutoRegolamento &&
    consensi.presaAttoVideosorveglianza &&
    consensi.presaAttoInformativa &&
    consensi.consensoCertificatoMedico

  const certificatoPronto = riusaCertificato
    ? certificatoValidoFinoAl !== null
    : file !== null && dataCertificato !== ''

  // Quello che il server firmerà. Serve anche a accorgersi se il socio cambia
  // un dato dopo aver chiesto il codice: in quel caso il codice non vale più,
  // perché l'impronta è legata al contenuto.
  const payload = () => ({ socioId: socio.id, modifiche, consensi })
  const datiCambiati = token !== '' && istantanea !== JSON.stringify(payload())

  async function chiediCodice() {
    setErrore('')
    setInCorso(true)
    try {
      const r = await fetch('/api/rinnovo/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload()),
      })
      const esito = await r.json()
      if (!r.ok) {
        setErrore(esito.error ?? 'Invio del codice non riuscito.')
        return
      }
      setToken(esito.token)
      setInviatoA(esito.email ?? '')
      setIstantanea(JSON.stringify(payload()))
      setCodice('')
    } catch {
      setErrore('Errore di connessione. Riprova.')
    } finally {
      setInCorso(false)
    }
  }

  async function firma() {
    setErrore('')
    setInCorso(true)
    try {
      let certificato: Record<string, unknown> = { riusa: true }

      if (!riusaCertificato) {
        if (!file || !dataCertificato) {
          setErrore('Carica il certificato e indica la data di emissione.')
          return
        }
        // Il file va diritto all'archivio: un PDF non passerebbe dai limiti di
        // corpo di una funzione server. Quello che passa dal server e' il
        // permesso: sceglie lui il percorso — casuale, perché quello di un
        // documento sanitario non deve contenere nome e cognome — e conta i
        // caricamenti per provenienza.
        const rilascio = await permessoDiCaricare(file, permessoCaricamento)

        const { error } = await supabase.storage
          .from('certificati-medici')
          .uploadToSignedUrl(rilascio.percorso, rilascio.token, file)
        if (error) {
          setErrore(`Caricamento del certificato fallito: ${error.message}`)
          return
        }
        certificato = { path: rilascio.percorso, dataCertificato }
      }

      const r = await fetch('/api/rinnovo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload(), token, codice, certificato }),
      })
      const esito = await r.json()
      if (!r.ok || !esito.ok) {
        setErrore(esito.error ?? 'Non è stato possibile completare il rinnovo.')
        return
      }

      if (esito.urlDownload) {
        const a = document.createElement('a')
        a.href = esito.urlDownload
        a.rel = 'noopener'
        document.body.appendChild(a)
        a.click()
        a.remove()
      }
      setFatto({ url: esito.urlDownload ?? null })
    } catch {
      setErrore('Errore di connessione. Riprova.')
    } finally {
      setInCorso(false)
    }
  }

  if (fatto) {
    return (
      <div className="rounded-2xl bg-green-50 border border-green-200 px-5 py-6 text-center">
        <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl font-bold text-green-600">
          ✓
        </div>
        <p className="text-sm font-extrabold text-green-800">
          Tesseramento {annoSportivo} rinnovato
        </p>
        <p className="text-sm text-green-700 mt-1.5 leading-relaxed">
          Il modulo firmato è stato scaricato. Lo trovi anche qui sotto fra i tuoi documenti.
        </p>
        {fatto.url && (
          <a
            href={fatto.url}
            className="inline-block mt-3 text-xs font-semibold text-green-800 underline underline-offset-2"
          >
            Scarica di nuovo il modulo
          </a>
        )}
      </div>
    )
  }

  const campo = (
    etichetta: string,
    chiave: keyof typeof modifiche,
    tipo: string = 'text'
  ) => (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{etichetta}</label>
      <input
        type={tipo}
        value={modifiche[chiave]}
        onChange={e => setModifiche(m => ({ ...m, [chiave]: e.target.value }))}
        className={inputClass}
      />
    </div>
  )

  const casella = (
    chiave: keyof typeof consensi,
    titolo: string,
    testo: React.ReactNode
  ) => (
    <label className="flex items-start gap-2.5 cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm transition-all hover:border-yellow-400 has-[:checked]:border-yellow-400 has-[:checked]:bg-yellow-50">
      <input
        type="checkbox"
        checked={consensi[chiave]}
        onChange={e => setConsensi(c => ({ ...c, [chiave]: e.target.checked }))}
        className="mt-0.5 h-5 w-5 accent-yellow-400 shrink-0"
      />
      <span className="text-sm text-gray-600 leading-relaxed">
        <span className="block font-bold text-gray-900 mb-0.5">{titolo}</span>
        {testo}
      </span>
    </label>
  )

  return (
    <div className="space-y-6">
      {/* Identità: si vede, non si tocca. */}
      <div className="rounded-2xl bg-gray-50 border border-gray-200 px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
          Chi rinnova
        </p>
        <p className="text-sm font-bold text-gray-900 mt-0.5">
          {socio.nome} {socio.cognome}
        </p>
        <p className="text-xs text-gray-500">
          {socio.cf} · nato il {giorno(socio.data_nascita)}
          {socio.luogo_nascita ? ` a ${socio.luogo_nascita}` : ''}
        </p>
        <p className="text-xs text-gray-400 mt-1.5">
          Nome, data di nascita e codice fiscale non si modificano da qui: se c&apos;è un errore,
          scrivi alla segreteria.
        </p>
      </div>

      <div>
        <h4 className="text-xs font-extrabold text-gray-400 uppercase tracking-wide mb-2">
          Controlla i tuoi recapiti
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {campo('Indirizzo', 'indirizzoResidenza')}
          {campo('Città', 'cittaResidenza')}
          {campo('CAP', 'capResidenza')}
          {campo('Provincia', 'provinciaResidenza')}
          {campo('Telefono', 'telefono', 'tel')}
          {campo('Email', 'email', 'email')}
        </div>
      </div>

      {minorenne && (
        <div>
          <h4 className="text-xs font-extrabold text-gray-400 uppercase tracking-wide mb-2">
            Chi firma per il socio minorenne
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {campo('Nome', 'genitoreNome')}
            {campo('Cognome', 'genitoreCognome')}
            {campo('Email (ci arriva il codice di firma)', 'genitoreEmail', 'email')}
            {campo('Recapito', 'genitoreContatto')}
          </div>
        </div>
      )}

      {/* Certificato medico */}
      <div>
        <h4 className="text-xs font-extrabold text-gray-400 uppercase tracking-wide mb-2">
          Certificato medico
        </h4>
        {certificatoValidoFinoAl && (
          <label className="flex items-start gap-2.5 cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm mb-2 has-[:checked]:border-yellow-400 has-[:checked]:bg-yellow-50">
            <input
              type="radio"
              checked={riusaCertificato}
              onChange={() => setRiusaCertificato(true)}
              className="mt-0.5 accent-yellow-400 w-4 h-4 shrink-0"
            />
            <span className="text-sm text-gray-600">
              <span className="block font-semibold text-gray-800">
                Uso quello che avete già
              </span>
              <span className="text-xs">Valido fino al {giorno(certificatoValidoFinoAl)}</span>
            </span>
          </label>
        )}
        <label className="flex items-start gap-2.5 cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm has-[:checked]:border-yellow-400 has-[:checked]:bg-yellow-50">
          <input
            type="radio"
            checked={!riusaCertificato}
            onChange={() => setRiusaCertificato(false)}
            className="mt-0.5 accent-yellow-400 w-4 h-4 shrink-0"
          />
          <span className="text-sm font-semibold text-gray-800">Ne carico uno nuovo</span>
        </label>

        {!riusaCertificato && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">File PDF</label>
              <input
                type="file"
                accept="application/pdf"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Data di emissione
              </label>
              <input
                type="date"
                value={dataCertificato}
                onChange={e => setDataCertificato(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        )}
      </div>

      {/* Dichiarazioni dell'anno */}
      <div className="space-y-2.5">
        <h4 className="text-xs font-extrabold text-gray-400 uppercase tracking-wide">
          Dichiarazioni per la stagione {annoSportivo}
        </h4>
        {casella(
          'dichiarazioneSalute',
          'Stato di salute',
          'Dichiaro sotto la mia responsabilità di essere di sana e robusta costituzione fisica per svolgere attività sportiva non agonistica.'
        )}
        {casella(
          'accettazioneStatutoRegolamento',
          'Statuto e Regolamento',
          <>
            Dichiaro di aver preso visione dello{' '}
            <a href="/statuto.pdf" target="_blank" className="text-yellow-600 font-bold underline">
              Statuto
            </a>{' '}
            e del{' '}
            <a href="/regolamento.pdf" target="_blank" className="text-yellow-600 font-bold underline">
              Regolamento
            </a>{' '}
            e di accettarli integralmente.
          </>
        )}
        {casella(
          'presaAttoVideosorveglianza',
          'Videosorveglianza dei locali',
          "Dichiaro di essere informato che nei locali in cui si svolge l'attività è attivo un impianto di videosorveglianza del Comune di Monesiglio, titolare del trattamento delle immagini."
        )}
        {casella(
          'presaAttoInformativa',
          'Informativa sulla privacy',
          <>
            Dichiaro di aver letto l&apos;
            <a href="/privacy" target="_blank" className="text-yellow-600 font-bold underline">
              informativa sul trattamento dei dati personali
            </a>{' '}
            ai sensi del Regolamento UE 2016/679.
          </>
        )}
        {casella(
          'consensoCertificatoMedico',
          'Certificato medico e dati sulla salute',
          'Acconsento al trattamento del certificato medico e dei dati sulla salute che contiene, per la sola verifica dell’idoneità alla pratica sportiva non agonistica. Senza questo consenso non è possibile rinnovare il tesseramento, perché senza certificato non è consentito svolgere attività sportiva. Puoi revocarlo quando vuoi scrivendo alla segreteria: in quel caso cancelliamo il certificato e non potrai più allenarti finché non ne consegni uno nuovo.'
        )}
        {casella(
          'consensoImmagini',
          'Uso delle immagini (facoltativo)',
          'Acconsento alla pubblicazione di foto e video che mi ritraggono sui canali dell’Associazione. Puoi rinnovare anche senza spuntare questa casella.'
        )}
      </div>

      {/* Firma */}
      <div className="rounded-2xl border-2 border-yellow-400 bg-yellow-50/40 px-4 py-4 space-y-3">
        <p className="text-sm font-bold text-gray-900">Firma il rinnovo</p>

        {datiCambiati && (
          <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
            Hai modificato qualcosa dopo aver richiesto il codice: quel codice non vale più,
            perché è legato a quello che avevi dichiarato. Richiedine uno nuovo.
          </p>
        )}

        {token && !datiCambiati && (
          <p className="text-xs text-gray-600">
            Codice inviato a <strong>{inviatoA}</strong>. Scadenza: 10 minuti.
          </p>
        )}

        {(!token || datiCambiati) && (
          <button
            type="button"
            onClick={chiediCodice}
            disabled={inCorso || !obbligatoriSpuntati || !certificatoPronto}
            className="bg-yellow-400 text-gray-900 px-5 py-3 rounded-xl font-bold text-sm hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all inline-flex items-center gap-2"
          >
            {inCorso && <Spinner className="h-4 w-4" />}
            {token ? 'Richiedi un nuovo codice' : 'Invia il codice di firma'}
          </button>
        )}

        {token && !datiCambiati && (
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Codice a 6 cifre
              </label>
              <input
                inputMode="numeric"
                maxLength={6}
                value={codice}
                onChange={e => setCodice(e.target.value.replace(/\D/g, ''))}
                className={`${inputClass} w-40 tracking-[0.4em] text-center font-bold`}
              />
            </div>
            <button
              type="button"
              onClick={firma}
              disabled={inCorso || codice.length !== 6}
              className="bg-gray-900 text-white px-5 py-3 rounded-xl font-bold text-sm hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed transition-all inline-flex items-center gap-2"
            >
              {inCorso && <Spinner className="h-4 w-4" />}
              {inCorso ? 'Firma in corso…' : 'Firma e rinnova'}
            </button>
          </div>
        )}

        {!obbligatoriSpuntati && (
          <p className="text-xs text-gray-500">
            Per firmare devi accettare le quattro dichiarazioni obbligatorie.
          </p>
        )}
        {obbligatoriSpuntati && !certificatoPronto && (
          <p className="text-xs text-gray-500">
            Carica il certificato medico e indica la data di emissione.
          </p>
        )}
        {errore && <p className="text-xs font-semibold text-red-600">{errore}</p>}
      </div>
    </div>
  )
}
