import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

  const userId = data.user.id
  const email = data.user.email

  // Gestore?
  const { data: gestore } = await supabase
    .from('gestori')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (gestore) {
    await supabase.from('gestori').update({ user_id: userId }).eq('email', email).is('user_id', null)
    return NextResponse.redirect(`${origin}/area-gestori`)
  }

  // Socio?
  const { data: socio } = await supabase
    .from('soci')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (socio) {
    await supabase.from('soci').update({ user_id: userId }).eq('email', email).is('user_id', null)
    return NextResponse.redirect(`${origin}/area-socio`)
  }

  return NextResponse.redirect(`${origin}/auth/non-autorizzato`)
}
