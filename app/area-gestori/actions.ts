'use server'

import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { notificaRichiestaRifiutata } from '@/lib/notifiche'
import { eseguiConfermaPagamento } from '@/lib/confermaPagamento'


export type GestoreResult =
  | { ok: true; message: string; ricevutaPath?: string }
  | { ok: false; error: string }

async function getGestore(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('gestori')
    .select('id, nome')
    .eq('user_id', user.id)
    .eq('attivo', true)
    .maybeSingle()
  return data ? { ...data, email: user.email } : null
}

export async function confermaPagamento(
  _prev: GestoreResult | null,
  formData: FormData
): Promise<GestoreResult> {
  const supabase = await createClient()
  const gestore = await getGestore(supabase)
  if (!gestore) return { ok: false, error: 'Accesso non autorizzato.' }

  const abbonamentiId = formData.get('abbonamento_id') as string
  if (!abbonamentiId) return { ok: false, error: 'Richiesta non indicata.' }

  // Il corpo della conferma sta in `lib/confermaPagamento.ts`, condiviso con
  // l'area dei tecnici: qui restano solo il controllo su chi conferma e le sue
  // credenziali.
  return eseguiConfermaPagamento({
    db: supabase,
    numera: (anno) => supabase.rpc('genera_numero_ricevuta', { p_anno: anno }),
    abbonamentoId: abbonamentiId,
    operatore: { tipo: 'gestore', id: gestore.id, nome: gestore.nome ?? gestore.email ?? 'Gestore' },
  })
}

export async function aggiornaCodiceCassetta(
  _prev: GestoreResult | null,
  formData: FormData
): Promise<GestoreResult> {
  const supabase = await createClient()
  const gestore = await getGestore(supabase)
  if (!gestore) return { ok: false, error: 'Accesso non autorizzato.' }

  const codice = (formData.get('codice') as string | null)?.trim()
  if (!codice) return { ok: false, error: 'Inserisci un codice.' }

  const { error } = await supabase
    .from('impostazioni')
    .upsert({ chiave: 'codice_cassetta', valore: codice, aggiornato_il: new Date().toISOString() })

  if (error) return { ok: false, error: `Salvataggio fallito: ${error.message}` }

  revalidatePath('/area-gestori')
  return { ok: true, message: 'Codice cassetta aggiornato.' }
}

const MAX_MOTIVO = 500

/**
 * Rifiuta una richiesta di pagamento, con la motivazione scritta dal gestore.
 *
 * Serve perche' ora la decorrenza la sceglie il socio, e un socio puo'
 * sbagliarla: chiedere di partire dal mese in corso quando intendeva il
 * successivo, o viceversa. Senza una via d'uscita l'unico rimedio sarebbe
 * confermare una cosa sbagliata e poi rimediare a mano nel database.
 *
 * La motivazione non e' facoltativa: e' l'unica cosa che il socio legge, e un
 * rifiuto muto lo lascerebbe ad aspettare una conferma che non arrivera' mai.
 * Il vincolo che la impone sta anche sulla tabella, non solo qui.
 */
export async function rifiutaPagamento(
  _prev: GestoreResult | null,
  formData: FormData
): Promise<GestoreResult> {
  const supabase = await createClient()
  const gestore = await getGestore(supabase)
  if (!gestore) return { ok: false, error: 'Accesso non autorizzato.' }

  const abbonamentoId = formData.get('abbonamento_id') as string
  if (!abbonamentoId) return { ok: false, error: 'Richiesta non indicata.' }

  const motivo = ((formData.get('motivo') as string | null) ?? '').trim()
  if (!motivo) return { ok: false, error: 'Scrivi il motivo del rifiuto: lo legge il socio.' }
  if (motivo.length > MAX_MOTIVO) {
    return { ok: false, error: `Il motivo non può superare i ${MAX_MOTIVO} caratteri.` }
  }

  // Serve per avvisare il socio, e va letto prima: dopo l'aggiornamento la
  // riga non e' piu' fra le richieste in attesa.
  const { data: ab, error: abErr } = await supabase
    .from('abbonamenti_soci')
    .select(`
      id, anno_sportivo,
      catalogo_attivita(nome_attivita),
      soci(nome, cognome, email, minorenne, genitore_email)
    `)
    .eq('id', abbonamentoId)
    .eq('stato_pagamento', 'da_saldare')
    .maybeSingle()

  if (abErr) return { ok: false, error: `Lettura della richiesta fallita: ${abErr.message}` }
  if (!ab) return { ok: false, error: 'Richiesta non trovata o già decisa.' }

  // Stessa presa in carico esclusiva della conferma: due gestori che agiscono
  // insieme non possono decidere due volte la stessa richiesta.
  const { data: preso, error: updErr } = await supabase
    .from('abbonamenti_soci')
    .update({
      stato_pagamento: 'rifiutato',
      motivo_rifiuto: motivo,
      rifiutato_il: new Date().toISOString(),
      // Prima non si scriveva: si sapeva l'istante del rifiuto al secondo e
      // non si sapeva chi lo avesse deciso.
      rifiutato_da: gestore.id,
      rifiutato_da_nome: gestore.nome ?? gestore.email,
    })
    .eq('id', abbonamentoId)
    .eq('stato_pagamento', 'da_saldare')
    .select('id')
    .maybeSingle()

  if (updErr) return { ok: false, error: `Rifiuto fallito: ${updErr.message}` }
  if (!preso) return { ok: false, error: 'Richiesta già decisa da un altro gestore.' }

  type SocioRifiuto = { nome?: string; cognome?: string; email?: string; minorenne?: boolean; genitore_email?: string | null }
  const socio = Array.isArray(ab.soci) ? (ab.soci[0] as SocioRifiuto) : (ab.soci as SocioRifiuto | null)
  const attivita = Array.isArray(ab.catalogo_attivita)
    ? ab.catalogo_attivita[0]
    : (ab.catalogo_attivita as { nome_attivita?: string } | null)

  // Come per la conferma: il rifiuto e' gia' registrato, l'avviso parte dopo
  // la risposta e un guasto del postino non lo annulla.
  after(async () => {
    await notificaRichiestaRifiutata({
      emailSocio: socio?.email,
      emailGenitore: socio?.minorenne ? socio?.genitore_email : null,
      nomeSocio: `${socio?.nome ?? ''} ${socio?.cognome ?? ''}`.trim(),
      attivita: attivita?.nome_attivita ?? 'Periodo di frequenza',
      motivo,
      annoSportivo: String(ab.anno_sportivo ?? ''),
    })
  })

  revalidatePath('/area-gestori')
  return { ok: true, message: 'Richiesta rifiutata. Il socio è stato avvisato.' }
}
