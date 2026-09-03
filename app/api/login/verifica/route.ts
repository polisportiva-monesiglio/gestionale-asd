import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { emailPlausibile } from '@/lib/email'
import { agganciaEDecidiDove } from '@/lib/agganciaAccesso'

/**
 * Il codice a sei cifre digitato sul sito, al posto del link.
 *
 * Esiste perché il link non regge l'uso reale. Lo scambio PKCE ha bisogno del
 * verificatore lasciato nel browser che ha *chiesto* l'accesso, e chi apre
 * l'email dall'app di Gmail o di Libero la apre in un browser interno, che
 * quel verificatore non ce l'ha: il link è buono, la persona è la persona
 * giusta, e il sito le dice che non è autorizzata. È successo il 3 settembre
 * 2026 a un gestore, che è entrato solo al secondo tentativo, e ai soci
 * sarebbe capitato di continuo.
 *
 * Un codice digitato non ha browser di partenza: si può leggere l'email sul
 * telefono e scrivere le cifre sul computer.
 *
 * Il codice lo verifica il server e non il browser perché la sessione deve
 * finire nei cookie leggibili dal proxy: `verifyOtp` sul client scriverebbe
 * solo nel `localStorage`, e le pagine di server non la vedrebbero.
 */
// Supabase genera un codice la cui lunghezza dipende dall'impostazione del
// progetto (qui otto cifre, non le sei del valore predefinito). Si accetta un
// intervallo invece di un numero: se domani cambia, il modulo non comincia a
// rifiutare codici validi senza che nessuno colleghi le due cose.
const LUNGHEZZA_MINIMA = 6
const LUNGHEZZA_MASSIMA = 10

export async function POST(req: NextRequest) {
  let email: string
  let codice: string
  try {
    const corpo = await req.json()
    email = String(corpo?.email ?? '').trim().toLowerCase()
    // Solo cifre: chi incolla il codice da un'email si porta dietro spazi.
    codice = String(corpo?.codice ?? '').replace(/\D/g, '')
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 })
  }

  // La lunghezza non si fissa a sei: e' un'impostazione del progetto, e qui
  // vale otto. Inchiodarla al numero sbagliato avrebbe rifiutato codici buoni
  // prima ancora di chiederlo a Supabase, che resta l'unico a saperlo davvero.
  if (!emailPlausibile(email) || codice.length < LUNGHEZZA_MINIMA || codice.length > LUNGHEZZA_MASSIMA) {
    return NextResponse.json({ error: 'Inserisci il codice che hai ricevuto per email.' }, { status: 400 })
  }

  const supabase = await createClient()

  // `type: 'email'` copre sia chi accede per la prima volta sia chi torna: al
  // primo accesso Supabase manda il modello "Conferma la tua email", dopo
  // quello del link magico, ma il codice si verifica allo stesso modo.
  const { data, error } = await supabase.auth.verifyOtp({ email, token: codice, type: 'email' })

  if (error || !data.user) {
    // Non si distingue "codice sbagliato" da "codice scaduto" da "indirizzo
    // che non ha mai chiesto niente": la pagina di accesso esiste apposta per
    // non dire a nessuno se un indirizzo appartiene a un socio.
    console.error('Verifica del codice di accesso fallita:', error?.message ?? 'nessun utente restituito')
    return NextResponse.json(
      { error: 'Codice non valido o scaduto. Richiedine uno nuovo.' },
      { status: 400 }
    )
  }

  const { destinazione } = await agganciaEDecidiDove(supabase, data.user.id, data.user.email)
  return NextResponse.json({ ok: true, destinazione })
}
