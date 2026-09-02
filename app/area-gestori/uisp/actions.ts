'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CHIAVI_INTESTAZIONE } from '@/lib/uisp'

export type EsitoInvio = { ok: true; message: string } | { ok: false; error: string }

/**
 * Annulla un invio: i soci tornano nell'elenco di quelli da mandare.
 *
 * Serve quando il file è stato generato ma alla UISP non è mai partito, o è
 * stato rifiutato. La riga dell'invio non si cancella: resta con la data di
 * annullamento, così la numerazione non presenta buchi inspiegabili e si vede
 * che quel numero è stato bruciato.
 */
export async function annullaInvio(_prev: EsitoInvio | null, formData: FormData): Promise<EsitoInvio> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Accesso non autorizzato.' }

  const { data: gestore } = await supabase
    .from('gestori')
    .select('id')
    .eq('user_id', user.id)
    .eq('attivo', true)
    .maybeSingle()

  if (!gestore) return { ok: false, error: 'Accesso non autorizzato.' }

  const invioId = String(formData.get('invio_id') ?? '')
  if (!invioId) return { ok: false, error: 'Invio non indicato.' }

  const admin = createAdminClient()

  // Claim atomico: solo chi riesce a marcare l'annullamento libera i soci, così
  // due clic ravvicinati non producono due messaggi di successo.
  const { data: annullato, error: annullaErr } = await admin
    .from('invii_uisp')
    .update({ annullato_il: new Date().toISOString() })
    .eq('id', invioId)
    .is('annullato_il', null)
    .select('id, numero')
    .maybeSingle()

  if (annullaErr) return { ok: false, error: `Annullamento fallito: ${annullaErr.message}` }
  if (!annullato) return { ok: false, error: 'Questo invio risulta già annullato.' }

  const { data: liberati, error: liberaErr } = await admin
    .from('tesseramenti_annuali')
    .update({ invio_uisp_id: null })
    .eq('invio_uisp_id', invioId)
    .select('id')

  if (liberaErr) return { ok: false, error: `Soci non liberati: ${liberaErr.message}` }

  revalidatePath('/area-gestori/uisp')
  const quanti = liberati?.length ?? 0
  return {
    ok: true,
    message: `Invio n. ${annullato.numero} annullato: ${quanti} ${quanti === 1 ? 'socio torna' : 'soci tornano'} da mandare.`,
  }
}

/**
 * Salva l'intestazione del modulo: chi firma e per quale associazione.
 *
 * Sta nelle impostazioni e non nel codice perche' cambia col presidente e col
 * codice di affiliazione, e perche' nessuno di questi valori e' deducibile dal
 * database dei soci.
 */
export async function salvaIntestazioneUisp(
  _prev: EsitoInvio | null,
  formData: FormData
): Promise<EsitoInvio> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Accesso non autorizzato.' }

  const { data: gestore } = await supabase
    .from('gestori')
    .select('id')
    .eq('user_id', user.id)
    .eq('attivo', true)
    .maybeSingle()

  if (!gestore) return { ok: false, error: 'Accesso non autorizzato.' }

  const righe = Object.entries(CHIAVI_INTESTAZIONE).map(([campo, chiave]) => ({
    chiave,
    valore: String(formData.get(campo) ?? '').trim().slice(0, 200),
    aggiornato_il: new Date().toISOString(),
  }))

  const admin = createAdminClient()
  const { error } = await admin.from('impostazioni').upsert(righe)

  if (error) return { ok: false, error: `Salvataggio fallito: ${error.message}` }

  revalidatePath('/area-gestori/uisp')
  return { ok: true, message: 'Intestazione del modulo aggiornata.' }
}
