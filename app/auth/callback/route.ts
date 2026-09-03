import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { agganciaEDecidiDove } from '@/lib/agganciaAccesso'

/**
 * Il ritorno dal link ricevuto per posta.
 *
 * Resta in piedi accanto al codice a sei cifre, e non al suo posto: i link già
 * spediti devono continuare a funzionare, e finché i modelli di email su
 * Supabase contengono `{{ .ConfirmationURL }}` è ancora questa la strada che
 * la gente percorre.
 *
 * ⚠️ Il suo limite è il motivo per cui esiste anche l'altra: lo scambio del
 * codice PKCE ha bisogno del verificatore depositato nel browser che ha
 * *chiesto* l'accesso. Chi apre l'email dall'app di Gmail, che usa un browser
 * suo, arriva qui senza verificatore e si vede rifiutare un link buono.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  // Due guasti diversi finiscono qui e vanno tenuti distinti: il link che non
  // si riesce a convertire in sessione, e l'indirizzo che non corrisponde a
  // nessuno. Confonderli fa dire "email non riconosciuta" a chi invece era
  // riconosciuto benissimo, e manda a cercare il problema dove non è.
  if (!code) {
    console.error('Callback di accesso senza parametro code: il link non riporta un codice da scambiare')
    return NextResponse.redirect(`${origin}/auth/non-autorizzato?motivo=link`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    console.error('Scambio del codice di accesso fallito:', error?.message ?? 'nessun utente restituito')
    return NextResponse.redirect(`${origin}/auth/non-autorizzato?motivo=link`)
  }

  const { destinazione } = await agganciaEDecidiDove(supabase, data.user.id, data.user.email)
  return NextResponse.redirect(`${origin}${destinazione}`)
}
