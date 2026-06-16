'use server'

import { createClient } from '@/lib/supabase/server'
import { getAnnoSportivo } from '@/lib/stagione'
import { revalidatePath } from 'next/cache'

export type ActionResult = { ok: true } | { ok: false; error: string }

export async function uploadCertificato(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sessione scaduta. Effettua di nuovo il login.' }

  const file = formData.get('file') as File | null
  const dataScadenza = formData.get('data_scadenza') as string | null

  if (!file || file.size === 0) return { ok: false, error: 'Seleziona un file PDF.' }
  if (!dataScadenza) return { ok: false, error: 'Inserisci la data di scadenza.' }

  const { data: socio } = await supabase
    .from('soci')
    .select('id')
    .eq('user_id', user.id)
    .single()
  if (!socio) return { ok: false, error: 'Profilo socio non trovato.' }

  const annoSportivo = getAnnoSportivo()
  const fileName = `${user.id}/${Date.now()}-certificato.pdf`
  const arrayBuffer = await file.arrayBuffer()

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('certificati-medici')
    .upload(fileName, arrayBuffer, { contentType: 'application/pdf', upsert: false })

  if (uploadError) return { ok: false, error: `Caricamento fallito: ${uploadError.message}` }

  const { error: updateError } = await supabase
    .from('tesseramenti_annuali')
    .update({
      url_certificato_pdf: uploadData.path,
      data_scadenza_certificato: dataScadenza,
    })
    .eq('socio_id', socio.id)
    .eq('anno_sportivo', annoSportivo)

  if (updateError) return { ok: false, error: `Aggiornamento fallito: ${updateError.message}` }

  revalidatePath('/area-socio')
  return { ok: true }
}

export async function richiestaAbbonamento(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sessione scaduta. Effettua di nuovo il login.' }

  const attivitaId = formData.get('attivita_id') as string | null
  const note = (formData.get('note') as string | null) || null
  const metodoPagamento = (formData.get('metodo_pagamento') as string | null) || null
  if (!attivitaId) return { ok: false, error: "Seleziona un'attività." }

  const { data: socio } = await supabase
    .from('soci')
    .select('id')
    .eq('user_id', user.id)
    .single()
  if (!socio) return { ok: false, error: 'Profilo socio non trovato.' }

  const annoSportivo = getAnnoSportivo()

  // Blocco se c'è già una richiesta in attesa per questa stagione
  const { data: pending } = await supabase
    .from('abbonamenti_soci')
    .select('id')
    .eq('socio_id', socio.id)
    .eq('anno_sportivo', annoSportivo)
    .eq('stato_pagamento', 'da_saldare')
    .maybeSingle()

  if (pending) {
    return { ok: false, error: 'Hai già una richiesta in attesa di conferma per questa stagione.' }
  }

  // UISP: €20 se primo pagamento della stagione
  const { data: giaPagato } = await supabase
    .from('abbonamenti_soci')
    .select('id')
    .eq('socio_id', socio.id)
    .eq('anno_sportivo', annoSportivo)
    .eq('stato_pagamento', 'pagato')
    .limit(1)

  const uispFee = giaPagato && giaPagato.length > 0 ? 0 : 20

  const { error } = await supabase
    .from('abbonamenti_soci')
    .insert({
      socio_id: socio.id,
      attivita_id: attivitaId,
      anno_sportivo: annoSportivo,
      stato_pagamento: 'da_saldare',
      importo_tesseramento_uisp: uispFee,
      note_socio: note,
      metodo_pagamento: metodoPagamento,
    })

  if (error) return { ok: false, error: `Richiesta fallita: ${error.message}` }

  revalidatePath('/area-socio')
  return { ok: true }
}
