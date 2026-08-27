import { type NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { ipDellaRichiesta } from '@/lib/ip'

// La stessa frase in ogni caso in cui la richiesta e' ben formata: indirizzo
// riconosciuto o no, chi guarda lo schermo vede questo e nient'altro. Se le
// due risposte differissero, la pagina di accesso direbbe a chiunque se un
// certo indirizzo appartiene a un socio dell'ASD.
const RISPOSTA_UNICA = {
  success: true,
  messaggio:
    'Se l\'indirizzo è registrato, riceverai un link per accedere. Controlla la tua casella di posta.',
}

function emailPlausibile(valore: unknown): valore is string {
  if (typeof valore !== 'string') return false
  const v = valore.trim()
  return v.length > 0 && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)
}

/**
 * L'indirizzo a cui tornera' il link. Lo calcola il server e non il browser:
 * se lo scegliesse il client, il link di accesso potrebbe essere indirizzato
 * altrove. Supabase filtra comunque sulla propria lista di redirect ammessi,
 * ma quella lista e' l'ultima difesa, non la prima.
 */
function origineDelSito(req: NextRequest): string {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  return host ? `${proto}://${host}` : req.nextUrl.origin
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()

    if (!emailPlausibile(email)) {
      return NextResponse.json({ error: 'Email mancante o non valida' }, { status: 400 })
    }

    const secret = process.env.OTP_SECRET
    if (!secret) {
      console.error('OTP_SECRET non configurato')
      return NextResponse.json({ error: 'Configurazione del server incompleta' }, { status: 500 })
    }

    const emailNormalizzata = email.trim().toLowerCase()
    const admin = createAdminClient()

    // Stesso contatore dell'OTP di iscrizione, con un prefisso diverso: i due
    // percorsi non si rubano il budget a vicenda. Il conteggio avviene prima
    // di sapere se l'indirizzo e' riconosciuto, di proposito: altrimenti chi
    // prova mille indirizzi per scoprire quali sono soci non incontrerebbe mai
    // un limite, visto che i tentativi a vuoto non spediscono nulla.
    const emailHash = crypto
      .createHmac('sha256', secret)
      .update(`login:${emailNormalizzata}`)
      .digest('hex')

    const { data: esitoLimite, error: erroreLimite } = await admin
      .rpc('registra_invio_otp', { p_email_hash: emailHash, p_ip: ipDellaRichiesta(req) })

    if (erroreLimite) {
      console.error('Errore rate limit login:', erroreLimite)
      return NextResponse.json({ error: 'Errore interno del server' }, { status: 500 })
    }

    if (esitoLimite !== 'ok') {
      return NextResponse.json(
        { error: "Troppe richieste di accesso. Attendi un'ora e riprova." },
        { status: 429 }
      )
    }

    const { data: riconosciuta, error: erroreRicerca } = await admin
      .rpc('email_riconosciuta', { p_email: emailNormalizzata })

    if (erroreRicerca) {
      console.error('Errore verifica email di accesso:', erroreRicerca)
      return NextResponse.json({ error: 'Errore interno del server' }, { status: 500 })
    }

    if (riconosciuta) {
      // Chiave pubblica anche qui: signInWithOtp e' un'operazione che il
      // browser potrebbe fare da solo. Quello che la chiave di servizio
      // aggiunge e' il controllo di cui sopra, non il potere di spedire.
      const pubblico = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } }
      )

      const { error } = await pubblico.auth.signInWithOtp({
        email: emailNormalizzata,
        options: { emailRedirectTo: `${origineDelSito(req)}/auth/callback` },
      })

      // Un guasto nell'invio si registra ma non si racconta: distinguere
      // "non ho spedito" da "non ti conosco" rimetterebbe in piedi proprio
      // la differenza che questa rotta esiste per cancellare.
      if (error) console.error('Invio link di accesso fallito:', error.message)
    }

    return NextResponse.json(RISPOSTA_UNICA)
  } catch (error) {
    console.error('Errore generico API login:', error)
    return NextResponse.json({ error: 'Errore interno del server' }, { status: 500 })
  }
}
