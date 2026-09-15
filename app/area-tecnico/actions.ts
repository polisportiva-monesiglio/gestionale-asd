'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { eseguiConfermaPagamento, type EsitoConferma } from '@/lib/confermaPagamento'

export type EsitoTecnico = EsitoConferma

/**
 * Il tecnico conferma il pagamento di una richiesta di un proprio corso.
 *
 * Una server action e' raggiungibile da chiunque sappia mandare la stessa
 * POST: qui si verifica tutto di nuovo, e nell'ordine giusto.
 *
 * 1. Chi scrive e' un tecnico attivo.
 * 2. La richiesta e' fra quelle da confermare **dei suoi corsi**: lo dice
 *    `richieste_miei_corsi()`, che il database calcola con la sua identita'.
 * 3. Solo allora il server scrive col client di servizio — il tecnico non ha
 *    permessi su abbonamenti, ricevute e archivio — mentre il numero della
 *    ricevuta lo chiede con la sessione del tecnico, cosi' il database rifa'
 *    il controllo invece di fidarsi del sito.
 */
export async function confermaPagamentoCorso(
  _prec: EsitoTecnico | null,
  formData: FormData
): Promise<EsitoTecnico> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sessione scaduta. Effettua di nuovo il login.' }

  const { data: tecnico } = await supabase
    .from('tecnici')
    .select('id, nome, email')
    .eq('user_id', user.id)
    .eq('attivo', true)
    .maybeSingle()

  if (!tecnico) return { ok: false, error: 'Accesso non autorizzato.' }

  const abbonamentoId = String(formData.get('abbonamento_id') ?? '')
  if (!abbonamentoId) return { ok: false, error: 'Richiesta non indicata.' }

  const { data: richieste, error: erroreRichieste } = await supabase.rpc('richieste_miei_corsi')
  if (erroreRichieste) {
    return { ok: false, error: `Lettura delle richieste fallita: ${erroreRichieste.message}` }
  }

  const eDelSuoCorso = ((richieste ?? []) as { abbonamento_id: string }[]).some(
    r => r.abbonamento_id === abbonamentoId
  )
  if (!eDelSuoCorso) {
    return { ok: false, error: 'Questa richiesta non è di un tuo corso, oppure è già stata decisa.' }
  }

  return eseguiConfermaPagamento({
    db: createAdminClient(),
    numera: anno =>
      supabase.rpc('genera_numero_ricevuta_corso', { p_abbonamento: abbonamentoId, p_anno: anno }),
    abbonamentoId,
    operatore: { tipo: 'tecnico', id: tecnico.id, nome: tecnico.nome ?? tecnico.email },
  })
}
