'use server'

import { createClient } from '@/lib/supabase/server'
import { getAnnoSportivo } from '@/lib/stagione'
import { revalidatePath } from 'next/cache'

export type ActionResult = { ok: true } | { ok: false; error: string }

const MAX_DIMENSIONE_CERTIFICATO = 5 * 1024 * 1024 // 5MB, coerente col limite del bucket
const FIRMA_PDF = '%PDF' // primi byte di un PDF valido

export async function uploadCertificato(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sessione scaduta. Effettua di nuovo il login.' }

  const file = formData.get('file') as File | null
  const dataCertificato = formData.get('data_certificato') as string | null

  if (!file || file.size === 0) return { ok: false, error: 'Seleziona un file PDF.' }
  if (!dataCertificato) return { ok: false, error: 'Inserisci la data del certificato.' }

  if (file.type !== 'application/pdf') {
    return { ok: false, error: 'Il file deve essere in formato PDF.' }
  }
  if (file.size > MAX_DIMENSIONE_CERTIFICATO) {
    return { ok: false, error: 'Il file supera la dimensione massima di 5MB.' }
  }

  const { data: socio } = await supabase
    .from('soci')
    .select('id')
    .eq('user_id', user.id)
    .single()
  if (!socio) return { ok: false, error: 'Profilo socio non trovato.' }

  const annoSportivo = getAnnoSportivo()
  const fileName = `${user.id}/${Date.now()}-certificato.pdf`
  const arrayBuffer = await file.arrayBuffer()

  // Verifica i byte reali (non basta fidarsi del MIME type dichiarato dal client)
  const intestazione = Buffer.from(arrayBuffer.slice(0, 4)).toString('utf-8')
  if (intestazione !== FIRMA_PDF) {
    return { ok: false, error: 'Il file non è un PDF valido.' }
  }

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('certificati-medici')
    .upload(fileName, arrayBuffer, { contentType: 'application/pdf', upsert: false })

  if (uploadError) return { ok: false, error: `Caricamento fallito: ${uploadError.message}` }

  const scadenzaCertificato = (() => {
    const d = new Date(dataCertificato)
    d.setFullYear(d.getFullYear() + 1)
    return d.toISOString().split('T')[0]
  })()

  const { data: tesseramentoAggiornato, error: updateError } = await supabase
    .from('tesseramenti_annuali')
    .update({
      url_certificato_pdf: uploadData.path,
      data_scadenza_certificato: scadenzaCertificato,
    })
    .eq('socio_id', socio.id)
    .eq('anno_sportivo', annoSportivo)
    .select('id')
    .single()

  if (updateError) return { ok: false, error: `Aggiornamento fallito: ${updateError.message}` }

  // Storico: ogni caricamento resta tracciato anche dopo un rinnovo,
  // così il socio può rivedere i certificati caricati in passato.
  const { error: storicoError } = await supabase
    .from('certificati_medici_storico')
    .insert({
      socio_id: socio.id,
      tesseramento_id: tesseramentoAggiornato.id,
      anno_sportivo: annoSportivo,
      url_certificato_pdf: uploadData.path,
      data_scadenza_certificato: scadenzaCertificato,
    })

  if (storicoError) console.error('Salvataggio storico certificato fallito:', storicoError.message)

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

  // Blocco "soft" lato applicazione (UX immediata); il blocco reale e
  // atomico è il vincolo UNIQUE parziale su (socio_id, anno_sportivo)
  // WHERE stato_pagamento = 'da_saldare' — evita richieste duplicate e
  // doppio addebito UISP anche in caso di richieste quasi simultanee.
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

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'Hai già una richiesta in attesa di conferma per questa stagione.' }
    }
    return { ok: false, error: `Richiesta fallita: ${error.message}` }
  }

  revalidatePath('/area-socio')
  return { ok: true }
}
