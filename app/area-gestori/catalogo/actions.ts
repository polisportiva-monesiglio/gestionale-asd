'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type CatalogoResult =
  | { ok: true; message: string }
  | { ok: false; error: string }

const TIPI = ['abbonamento_mensile', 'pacchetto_ingressi', 'corso'] as const
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
  if (!tipo || !(TIPI as readonly string[]).includes(tipo)) return { ok: false as const, error: 'Tipo non valido.' }

  const durata = durata_mesi ? Number(durata_mesi) : 0

  // Un corso senza durata non avrebbe un periodo: il tecnico non potrebbe mai
  // vedere una quota "in regola", perche' la regola e' "oggi e' dentro il
  // periodo pagato".
  if (tipo === 'corso' && !(durata >= 1)) {
    return { ok: false as const, error: 'Un corso ha bisogno di una durata in mesi.' }
  }

  // Solo identificativi ben formati: il vincolo della tabella rifiuterebbe gli
  // altri comunque, ma con un errore che dal catalogo non si capirebbe.
  const tecnici = tipo === 'corso'
    ? formData.getAll('tecnici').map(String).filter(v => UUID.test(v))
    : []

  return {
    ok: true as const,
    values: {
      nome_attivita,
      tipo,
      prezzo_base: prezzo_base ? Number(prezzo_base) : 0,
      durata_mesi: durata,
      quantita_ingressi: quantita_ingressi ? Number(quantita_ingressi) : 0,
    },
    tecnici,
  }
}

/**
 * Chi tiene il corso, riscritto da capo a ogni salvataggio.
 *
 * Si cancella e si rimette invece di calcolare la differenza: sono al massimo
 * due o tre righe, e cosi' un'attivita' che smette di essere un corso perde
 * anche i suoi tecnici, invece di lasciarli agganciati a qualcosa che non
 * tengono piu'.
 */
async function salvaTecnici(
  supabase: Awaited<ReturnType<typeof createClient>>,
  attivitaId: string,
  tipo: string,
  tecnici: string[]
): Promise<string | null> {
  const { error: erroreCancella } = await supabase.from('corsi_tecnici').delete().eq('attivita_id', attivitaId)
  if (erroreCancella) return erroreCancella.message
  if (tipo !== 'corso' || tecnici.length === 0) return null

  const { error } = await supabase
    .from('corsi_tecnici')
    .insert(tecnici.map(tecnico_id => ({ attivita_id: attivitaId, tecnico_id })))
  return error?.message ?? null
}

function aggiornaPagine() {
  revalidatePath('/area-gestori/catalogo')
  revalidatePath('/area-gestori/admin')
  revalidatePath('/area-tecnico')
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

  const { data: creata, error } = await supabase
    .from('catalogo_attivita')
    .insert({ ...parsed.values, attivo: true })
    .select('id')
    .single()
  if (error || !creata) return { ok: false, error: `Inserimento fallito: ${error?.message ?? 'nessuna riga'}` }

  const erroreTecnici = await salvaTecnici(supabase, creata.id, parsed.values.tipo, parsed.tecnici)
  aggiornaPagine()
  if (erroreTecnici) {
    return { ok: false, error: `Voce creata, ma i tecnici non sono stati assegnati: ${erroreTecnici}` }
  }
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

  const erroreTecnici = await salvaTecnici(supabase, id, parsed.values.tipo, parsed.tecnici)
  aggiornaPagine()
  if (erroreTecnici) {
    return { ok: false, error: `Voce aggiornata, ma i tecnici non sono stati salvati: ${erroreTecnici}` }
  }
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

  aggiornaPagine()
  return { ok: true, message: 'Aggiornato.' }
}
