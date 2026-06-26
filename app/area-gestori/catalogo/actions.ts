'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type CatalogoResult =
  | { ok: true; message: string }
  | { ok: false; error: string }

async function getGestore(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('gestori')
    .select('id')
    .eq('user_id', user.id)
    .eq('attivo', true)
    .maybeSingle()
  return data
}

function parseAttivita(formData: FormData) {
  const nome_attivita = (formData.get('nome_attivita') as string | null)?.trim()
  const tipo = formData.get('tipo') as string | null
  const prezzo_base = formData.get('prezzo_base') as string | null
  const durata_mesi = formData.get('durata_mesi') as string | null
  const quantita_ingressi = formData.get('quantita_ingressi') as string | null

  if (!nome_attivita) return { ok: false as const, error: 'Inserisci un nome.' }
  if (tipo !== 'abbonamento_mensile' && tipo !== 'pacchetto_ingressi') return { ok: false as const, error: 'Tipo non valido.' }

  return {
    ok: true as const,
    values: {
      nome_attivita,
      tipo,
      prezzo_base: prezzo_base ? Number(prezzo_base) : 0,
      durata_mesi: durata_mesi ? Number(durata_mesi) : 0,
      quantita_ingressi: quantita_ingressi ? Number(quantita_ingressi) : 0,
    },
  }
}

export async function creaAttivita(
  _prev: CatalogoResult | null,
  formData: FormData
): Promise<CatalogoResult> {
  const supabase = await createClient()
  const gestore = await getGestore(supabase)
  if (!gestore) return { ok: false, error: 'Accesso non autorizzato.' }

  const parsed = parseAttivita(formData)
  if (!parsed.ok) return { ok: false, error: parsed.error }

  const { error } = await supabase.from('catalogo_attivita').insert({ ...parsed.values, attivo: true })
  if (error) return { ok: false, error: `Inserimento fallito: ${error.message}` }

  revalidatePath('/area-gestori/catalogo')
  return { ok: true, message: 'Voce catalogo creata.' }
}

export async function aggiornaAttivita(
  _prev: CatalogoResult | null,
  formData: FormData
): Promise<CatalogoResult> {
  const supabase = await createClient()
  const gestore = await getGestore(supabase)
  if (!gestore) return { ok: false, error: 'Accesso non autorizzato.' }

  const id = formData.get('id') as string
  if (!id) return { ok: false, error: 'ID mancante.' }

  const parsed = parseAttivita(formData)
  if (!parsed.ok) return { ok: false, error: parsed.error }

  const { error } = await supabase.from('catalogo_attivita').update(parsed.values).eq('id', id)
  if (error) return { ok: false, error: `Aggiornamento fallito: ${error.message}` }

  revalidatePath('/area-gestori/catalogo')
  return { ok: true, message: 'Voce catalogo aggiornata.' }
}

export async function toggleAttivaAttivita(
  _prev: CatalogoResult | null,
  formData: FormData
): Promise<CatalogoResult> {
  const supabase = await createClient()
  const gestore = await getGestore(supabase)
  if (!gestore) return { ok: false, error: 'Accesso non autorizzato.' }

  const id = formData.get('id') as string
  const attivo = formData.get('attivo') === 'true'

  const { error } = await supabase.from('catalogo_attivita').update({ attivo }).eq('id', id)
  if (error) return { ok: false, error: `Aggiornamento fallito: ${error.message}` }

  revalidatePath('/area-gestori/catalogo')
  return { ok: true, message: 'Aggiornato.' }
}
