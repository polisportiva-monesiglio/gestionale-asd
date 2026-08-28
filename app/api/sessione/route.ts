import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Un battito che tiene viva la sessione di chi ha una scheda aperta.
 *
 * Il token di accesso dura un'ora e sul server nessuno lo rinnova in
 * sottofondo: si rinnova solo quando arriva una richiesta. Un gestore che
 * lascia aperta l'area e torna dopo mezza giornata, senza questo, farebbe
 * partire il rinnovo insieme a tutte le richieste del primo clic, tutte con
 * lo stesso token di rinnovo che vale una volta sola. Qui invece il rinnovo
 * avviene da solo, in una richiesta tranquilla, molto prima del clic.
 *
 * Il lavoro vero lo fa il proxy, che passa davanti a questa rotta e rinnova i
 * cookie. Qui si dice soltanto se la sessione e' ancora in piedi, perche' il
 * browser possa accorgersene invece di restare su una pagina morta.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return NextResponse.json(
    { attiva: Boolean(user) },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
