"use client"

import { useEffect, useState } from 'react'
import { Spinner } from '@/app/components/Spinner'

/**
 * L'accesso in due passi: si chiede il codice, poi lo si digita.
 *
 * Il link ricevuto per posta non regge l'uso reale. Lo scambio PKCE ha bisogno
 * del verificatore lasciato nel browser che ha *chiesto* l'accesso, e chi apre
 * l'email dall'app di Gmail o di Libero la apre in un browser interno, che
 * quel verificatore non ce l'ha. Risultato: link buono, persona giusta, e il
 * sito che risponde "non autorizzata". Un codice digitato non ha browser di
 * partenza — si legge l'email sul telefono e si scrive sul computer.
 *
 * Dal 3 settembre 2026 entrambi i modelli di email su Supabase — *Magic Link*
 * per chi è già registrato e *Confirm signup* per chi accede la prima volta —
 * contengono `{{ .Token }}`, quindi arriva il codice. `/auth/callback` resta al
 * suo posto per i link spediti prima del cambio, che restano validi finché non
 * scadono.
 */
export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [codice, setCodice] = useState('')
  const [passo, setPasso] = useState<'email' | 'codice'>('email')
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState('')

  // Supabase non manda un secondo codice allo stesso indirizzo prima di un
  // minuto (impostazione *Minimum interval per user*). La pagina pero'
  // risponde sempre "se l'indirizzo e' registrato riceverai un codice", di
  // proposito, per non dire a nessuno chi e' socio: senza questo conto alla
  // rovescia chi ripreme troppo presto si sente dire di si' e non riceve
  // niente, e chiama la segreteria.
  const [attesa, setAttesa] = useState(0)

  useEffect(() => {
    if (attesa <= 0) return
    const t = setTimeout(() => setAttesa((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [attesa])

  async function chiediCodice(e: React.FormEvent) {
    e.preventDefault()
    setInCorso(true)
    setErrore('')

    // Il codice lo chiede il server, non il browser: solo così si può
    // controllare che l'indirizzo appartenga a un socio o a un gestore prima
    // di spedirlo. Fatto da qui, con la chiave pubblica, ogni indirizzo
    // digitato faceva nascere un utente in auth.users.
    try {
      const risposta = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const esito = await risposta.json()

      if (!risposta.ok) {
        setErrore(esito.error ?? "Non è stato possibile inviare il codice di accesso.")
        return
      }

      setPasso('codice')
      setAttesa(60)
    } catch {
      setErrore("Non è stato possibile contattare il server. Riprova.")
    } finally {
      setInCorso(false)
    }
  }

  async function verificaCodice(e: React.FormEvent) {
    e.preventDefault()
    setInCorso(true)
    setErrore('')

    try {
      const risposta = await fetch('/api/login/verifica', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, codice }),
      })
      const esito = await risposta.json()

      if (!risposta.ok || !esito.ok) {
        setErrore(esito.error ?? 'Codice non valido. Riprova.')
        return
      }

      // Non `router.push`: la sessione è appena stata scritta nei cookie, e
      // serve che sia il proxy a rileggerla su una richiesta nuova.
      window.location.assign(esito.destinazione)
    } catch {
      setErrore("Non è stato possibile contattare il server. Riprova.")
    } finally {
      setInCorso(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow p-8">
        <h1 className="text-xl font-bold text-gray-900 mb-2">Accedi</h1>

        {passo === 'email' ? (
          <>
            <p className="text-sm text-gray-500 mb-6">
              Inserisci la tua email: ti invieremo un codice per accedere, senza password.
            </p>

            <form onSubmit={chiediCodice} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  placeholder="nome@esempio.it"
                />
              </div>

              {errore && <p className="text-sm text-red-600">{errore}</p>}

              <button
                type="submit"
                disabled={inCorso || attesa > 0}
                className="w-full rounded-lg bg-yellow-400 hover:bg-yellow-500 disabled:opacity-60 text-gray-900 font-semibold py-2 transition-colors inline-flex items-center justify-center gap-2"
              >
                {inCorso && <Spinner className="h-4 w-4" />}
                {inCorso
                  ? 'Invio in corso...'
                  : attesa > 0
                    ? `Attendi ${attesa} secondi`
                    : 'Invia il codice'}
              </button>

              {attesa > 0 && (
                <p className="text-xs text-gray-400 text-center">
                  Un codice &egrave; gi&agrave; partito poco fa. Controlla la posta, anche
                  nello spam: se non arriva, riprova fra {attesa} secondi.
                </p>
              )}
            </form>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-6">
              Se l&apos;indirizzo &egrave; registrato, hai ricevuto un&apos;email con un
              codice numerico. Scrivilo qui sotto: puoi leggerlo dal telefono anche se
              stai usando il computer.
            </p>

            {/* L'indirizzo si rimostra perche' e' l'errore piu' comune e il piu'
                muto: chi sbaglia a digitarlo aspetta un codice che non arrivera'
                mai, e non ha modo di accorgersene. Non rivela niente — l'ha
                appena scritto lui. */}
            <p className="text-sm text-gray-700 -mt-4 mb-6 break-all">
              Inviato a <strong className="font-semibold">{email}</strong>
            </p>

            <form onSubmit={verificaCodice} className="space-y-4">
              <div>
                <label htmlFor="codice" className="block text-sm font-medium text-gray-700 mb-1">
                  Codice ricevuto per email
                </label>
                <input
                  id="codice"
                  // `text` e non `number`: con `number` il browser mangia gli
                  // zeri iniziali e mostra le frecce su e giu'.
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  maxLength={10}
                  value={codice}
                  onChange={(e) => setCodice(e.target.value.replace(/\D/g, ''))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-center text-xl font-mono tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  // Otto trattini perche' otto sono le cifre del codice su questo
                  // progetto (Authentication -> Sign In / Providers -> Email ->
                  // *Email OTP Length*). E' un aiuto visivo, non un controllo:
                  // chi valida e' la rotta, che accetta un intervallo. Se un
                  // giorno la lunghezza cambia, qui va cambiato il segnaposto —
                  // sbagliarlo non blocca nessuno, ma dice una cosa falsa a chi
                  // sta contando le cifre mentre le copia.
                  placeholder="– – – – – – – –"
                  autoFocus
                />
              </div>

              {errore && <p className="text-sm text-red-600">{errore}</p>}

              <button
                type="submit"
                disabled={inCorso || codice.length < 6}
                className="w-full rounded-lg bg-yellow-400 hover:bg-yellow-500 disabled:opacity-60 text-gray-900 font-semibold py-2 transition-colors inline-flex items-center justify-center gap-2"
              >
                {inCorso && <Spinner className="h-4 w-4" />}
                {inCorso ? 'Verifica in corso...' : 'Entra'}
              </button>

              <button
                type="button"
                onClick={() => { setPasso('email'); setCodice(''); setErrore('') }}
                className="w-full text-sm text-gray-500 hover:text-gray-800 transition-colors"
              >
                {attesa > 0
                  ? `Cambia indirizzo (nuovo codice fra ${attesa}s)`
                  : 'Cambia indirizzo o richiedi un altro codice'}
              </button>

              <p className="text-xs text-gray-400 text-center pt-2 border-t border-gray-100">
                Hai ricevuto un link invece di un codice? Aprilo pure: funziona ancora,
                ma va aperto nello stesso browser da cui hai chiesto l&apos;accesso.
              </p>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
