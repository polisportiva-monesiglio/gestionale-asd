import 'server-only'
import type { createClient } from '@/lib/supabase/server'

/**
 * Dove mandare chi ha appena provato la propria email, e a cosa agganciarlo.
 *
 * Vive qui perché i percorsi che concludono un accesso sono due — il link
 * ricevuto per posta e il codice a sei cifre digitato sul sito — e sono
 * destinati a restare due. Due copie della stessa procedura divergono: in
 * questo progetto è già successo con la firma, quando l'indirizzo a cui
 * spedire il codice era scelto da una parte e verificato dall'altra, e per un
 * minorenne le due scelte non coincidevano.
 *
 * L'aggancio si fa con la sessione appena creata, non con la chiave di
 * servizio: così è la RLS a stabilire che quella riga sia davvero di chi si è
 * autenticato, e non un controllo che potrei scrivere storto. Le policy
 * `claim by email` pretendono `user_id is null`, quindi una riga già di
 * qualcun altro non si può rubare.
 */
export type EsitoAccesso = { destinazione: string }

export async function agganciaEDecidiDove(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  email: string | undefined
): Promise<EsitoAccesso> {
  // Supabase normalizza già in minuscolo l'indirizzo dell'account, ma qui il
  // confronto è esatto — sia in `.eq()` sia nelle policy — quindi l'assunzione
  // va scritta invece che sperata.
  const indirizzo = email?.toLowerCase()

  if (!indirizzo) {
    console.error('Accesso senza indirizzo email associato all’utente')
    return { destinazione: '/auth/non-autorizzato' }
  }

  // Gestore?
  const { data: gestore } = await supabase
    .from('gestori')
    .select('id')
    .eq('email', indirizzo)
    .maybeSingle()

  if (gestore) {
    await supabase.from('gestori').update({ user_id: userId }).eq('email', indirizzo).is('user_id', null)
    return { destinazione: '/area-gestori' }
  }

  // Socio? Anche più d'uno: un genitore indica la propria email sul modulo di
  // ciascun figlio, quindi allo stesso indirizzo possono corrispondere più
  // soci. Vanno agganciati tutti, e la ricerca non può usare maybeSingle(),
  // che con due righe restituisce errore — era così che due fratelli si
  // bloccavano a vicenda l'accesso, leggendo "Email non riconosciuta".
  const { data: soci, error: erroreSoci } = await supabase
    .from('soci')
    .select('id')
    .eq('email', indirizzo)

  if (erroreSoci) {
    console.error('Ricerca del socio per email fallita:', erroreSoci.message)
    return { destinazione: '/auth/non-autorizzato?motivo=link' }
  }

  if ((soci?.length ?? 0) > 0) {
    const { error: aggancioErr } = await supabase
      .from('soci')
      .update({ user_id: userId })
      .eq('email', indirizzo)
      .is('user_id', null)

    // L'aggancio può fallire senza impedire l'accesso — le righe già agganciate
    // restano tali — ma se fallisce in silenzio il socio entra e non vede nulla,
    // che è il modo peggiore di rompersi.
    if (aggancioErr) console.error('Aggancio del socio all’account fallito:', aggancioErr.message)

    return { destinazione: '/area-socio' }
  }

  return { destinazione: '/auth/non-autorizzato' }
}
